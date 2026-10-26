// Package agency is the client for tax agencies' e-file and refund status endpoints.
//
// Each jurisdiction has its own agency (the IRS for federal, the Franchise Tax Board for
// California) with its own endpoint, credentials, and rate limit.
package agency

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel/trace"
	"golang.org/x/time/rate"
)

// MaxBatch is the most submission IDs one status request may carry.
const MaxBatch = 100

// Jurisdiction describes one tax agency.
type Jurisdiction struct {
	Code   string // value stored in tax_returns.jurisdiction
	Agency string // short id, e.g. "irs"
	Name   string // shown to taxpayers, e.g. "IRS"
}

var Jurisdictions = []Jurisdiction{
	{Code: "federal", Agency: "irs", Name: "IRS"},
	{Code: "CA", Agency: "ca-ftb", Name: "California FTB"},
}

func Lookup(code string) (Jurisdiction, bool) {
	for _, j := range Jurisdictions {
		if j.Code == code {
			return j, true
		}
	}
	return Jurisdiction{}, false
}

type SubmitRequest struct {
	Reference   string `json:"reference"` // our return ID; the agency's idempotency key
	Form        string `json:"form"`
	TaxYear     int    `json:"taxYear"`
	RefundCents int64  `json:"refundCents"`
	OwedCents   int64  `json:"owedCents"`
}

type SubmitResponse struct {
	SubmissionID string    `json:"submissionId"`
	Status       string    `json:"status"`
	ReceivedAt   time.Time `json:"receivedAt"`
}

type StatusResult struct {
	SubmissionID string    `json:"submissionId"`
	Status       string    `json:"status"` // received, processing, approved, sent, accepted, action_required, not_found
	PaymentDate  string    `json:"paymentDate,omitempty"`
	UpdatedAt    time.Time `json:"updatedAt"`
	Manual       bool      `json:"manual,omitempty"` // mock only: set by an operator, not the automatic timeline
}

type statusRequest struct {
	SubmissionIDs []string `json:"submissionIds"`
}

type statusResponse struct {
	Results []StatusResult `json:"results"`
}

type Client struct {
	Jurisdiction Jurisdiction
	baseURL      string
	apiKey       string
	adminKey     string
	http         *http.Client
	limiter      *rate.Limiter
	maxAttempts  int
}

// NewClient returns a client limited to rps requests per second to this agency. The agency
// sets the overall limit; callers divide it across shards.
func NewClient(j Jurisdiction, baseURL, apiKey string, rps float64, tp trace.TracerProvider) *Client {
	return &Client{
		Jurisdiction: j,
		baseURL:      baseURL,
		apiKey:       apiKey,
		http: &http.Client{
			Timeout:   10 * time.Second,
			Transport: otelhttp.NewTransport(http.DefaultTransport, otelhttp.WithTracerProvider(tp)),
		},
		limiter:     rate.NewLimiter(rate.Limit(rps), max(1, int(rps))),
		maxAttempts: 4,
	}
}

func (c *Client) Submit(ctx context.Context, req SubmitRequest) (SubmitResponse, error) {
	var out SubmitResponse
	err := c.do(ctx, http.MethodPost, "/v1/returns", c.apiKey, req, &out)
	return out, err
}

// WithAdminKey enables the mock agency's operator endpoints on this client.
func (c *Client) WithAdminKey(key string) *Client {
	c.adminKey = key
	return c
}

// SetStatus pins a submission to a status at the mock agency (demo operator only).
func (c *Client) SetStatus(ctx context.Context, submissionID, status, paymentDate string) (StatusResult, error) {
	var out StatusResult
	body := map[string]string{"status": status, "paymentDate": paymentDate}
	err := c.do(ctx, http.MethodPut, "/v1/admin/submissions/"+url.PathEscape(submissionID), c.adminKey, body, &out)
	return out, err
}

// ClearStatus returns a submission to the mock agency's automatic timeline.
func (c *Client) ClearStatus(ctx context.Context, submissionID string) (StatusResult, error) {
	var out StatusResult
	err := c.do(ctx, http.MethodDelete, "/v1/admin/submissions/"+url.PathEscape(submissionID), c.adminKey, nil, &out)
	return out, err
}

func (c *Client) BatchStatus(ctx context.Context, ids []string) ([]StatusResult, error) {
	if len(ids) > MaxBatch {
		return nil, fmt.Errorf("batch of %d exceeds the agency limit of %d", len(ids), MaxBatch)
	}
	var out statusResponse
	err := c.do(ctx, http.MethodPost, "/v1/statuses/batch-get", c.apiKey, statusRequest{SubmissionIDs: ids}, &out)
	return out.Results, err
}

// StatusError is a non-retryable error response from the agency.
type StatusError struct{ Code int }

func (e *StatusError) Error() string { return fmt.Sprintf("agency returned HTTP %d", e.Code) }

// do sends JSON with rate limiting and retries. 429 and 5xx responses and network errors are
// retried with exponential backoff and jitter, honouring Retry-After.
func (c *Client) do(ctx context.Context, method, path, key string, body, out any) error {
	var payload []byte
	if body != nil {
		var err error
		if payload, err = json.Marshal(body); err != nil {
			return err
		}
	}
	var lastErr error
	for attempt := range c.maxAttempts {
		if err := c.limiter.Wait(ctx); err != nil {
			return err
		}
		retryAfter, err := c.once(ctx, method, path, key, payload, out)
		if err == nil {
			return nil
		}
		lastErr = err
		var se *StatusError
		if errors.As(err, &se) || ctx.Err() != nil {
			return err
		}
		backoff := time.Duration(100*(1<<attempt))*time.Millisecond + time.Duration(rand.IntN(100))*time.Millisecond
		if retryAfter > backoff {
			backoff = retryAfter
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
		}
	}
	return fmt.Errorf("%s %s failed after %d attempts: %w", c.Jurisdiction.Agency, path, c.maxAttempts, lastErr)
}

type retryableError struct{ msg string }

func (e retryableError) Error() string { return e.msg }

func (c *Client) once(ctx context.Context, method, path, key string, payload []byte, out any) (time.Duration, error) {
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)
	resp, err := c.http.Do(req)
	if err != nil {
		return 0, retryableError{err.Error()}
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
		io.Copy(io.Discard, resp.Body)
		secs, _ := strconv.Atoi(resp.Header.Get("Retry-After"))
		return time.Duration(secs) * time.Second, retryableError{fmt.Sprintf("agency returned HTTP %d", resp.StatusCode)}
	case resp.StatusCode >= 300:
		io.Copy(io.Discard, resp.Body)
		return 0, &StatusError{Code: resp.StatusCode}
	}
	return 0, json.NewDecoder(resp.Body).Decode(out)
}
