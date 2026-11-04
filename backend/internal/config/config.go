// Package config loads settings from environment variables.
package config

import (
	"fmt"
	"net/netip"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Env         string // "dev" enables insecure defaults for local debugging
	Addr        string
	DatabaseURL string

	SessionTTL   time.Duration
	CookieSecure bool
	BankHMACKey  []byte
	// Proxies whose X-Forwarded-For entries are believed when working out a client's address.
	// Production lists only its own load balancers and the portal's pods.
	TrustedProxies []netip.Prefix

	MigrateOnStart bool
	SeedDemoUsers  bool

	// Processor: screens new returns and transmits them to the agencies.
	ProcessorInterval   time.Duration
	SimilarityThreshold float64 // cosine distance below which returns count as near-duplicates
	SubmitRPS           float64 // transmissions per second to each agency, shared by every processor replica

	// Batch status sync.
	BatchInterval   time.Duration // time between scheduled runs (batch-schedule and `all`)
	BatchChunkSize  int           // submission IDs per agency request (agency max 100)
	BatchWorkers    int           // concurrent chunks per shard
	BatchShards     int           // total shards; each claims hash(id) % shards == index
	BatchShardIndex int
	BatchLease      time.Duration
	// How soon to check a return again while the agency is still working on it. Production
	// would align this with agency update cycles (hours); the demo uses seconds.
	RecheckInterval time.Duration

	// Agencies.
	AgencyURLs     map[string]string // by agency id: "irs", "ca-ftb"
	AgencyAPIKey   string
	AgencyAdminKey string  // demo only: lets the admin UI change statuses at the mock agencies
	AgencyRPS      float64 // per agency, per process

	// Agency mock (the `agency` command and `all`).
	Mock MockConfig
}

type MockConfig struct {
	Agency       string
	Addr         string
	ProcessAfter time.Duration
	ApproveAfter time.Duration
	SendAfter    time.Duration
	ErrorRate    float64
	Latency      time.Duration
}

const (
	devDatabaseURL    = "postgres://taxrefund:taxrefund@localhost:5432/taxrefund?sslmode=disable"
	devHMACKey        = "dev-only-bank-hmac-key-change-me"
	devAgencyKey      = "dev-only-agency-api-key"
	devAgencyAdminKey = "dev-only-agency-admin-key"

	// Loopback and private ranges: wherever the portal and any load balancer run in a local cluster.
	defaultTrustedProxies = "127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7"
)

func Load() (Config, error) {
	c := Config{
		Env:                 get("APP_ENV", "dev"),
		Addr:                get("ADDR", ":8080"),
		DatabaseURL:         os.Getenv("DATABASE_URL"),
		SessionTTL:          duration("SESSION_TTL_MINUTES", 30, time.Minute),
		CookieSecure:        getBool("COOKIE_SECURE", false),
		BankHMACKey:         []byte(os.Getenv("BANK_HMAC_KEY")),
		MigrateOnStart:      getBool("MIGRATE_ON_START", true),
		SeedDemoUsers:       getBool("SEED_DEMO_USERS", true),
		ProcessorInterval:   duration("PROCESSOR_INTERVAL_MS", 2000, time.Millisecond),
		SimilarityThreshold: getFloat("SIMILARITY_THRESHOLD", 0.02),
		SubmitRPS:           getFloat("SUBMIT_RPS", 10),
		BatchInterval:       duration("BATCH_INTERVAL_SECONDS", 15, time.Second),
		BatchChunkSize:      min(getInt("BATCH_CHUNK_SIZE", 100), 100),
		BatchWorkers:        max(getInt("BATCH_WORKERS", 4), 1),
		BatchShards:         max(getInt("BATCH_SHARDS", 1), 1),
		// Kubernetes Indexed Jobs set JOB_COMPLETION_INDEX on each pod.
		BatchShardIndex: getInt("BATCH_SHARD_INDEX", getInt("JOB_COMPLETION_INDEX", 0)),
		BatchLease:      duration("BATCH_LEASE_SECONDS", 120, time.Second),
		RecheckInterval: duration("RECHECK_INTERVAL_SECONDS", 10, time.Second),
		AgencyURLs: map[string]string{
			"irs":    os.Getenv("AGENCY_IRS_URL"),
			"ca-ftb": os.Getenv("AGENCY_CA_FTB_URL"),
			"ny-dtf": os.Getenv("AGENCY_NY_DTF_URL"),
		},
		AgencyAPIKey:   os.Getenv("AGENCY_API_KEY"),
		AgencyAdminKey: os.Getenv("AGENCY_ADMIN_KEY"),
		AgencyRPS:      getFloat("AGENCY_RPS", 20),
		Mock: MockConfig{
			Agency:       get("AGENCY", "irs"),
			Addr:         get("AGENCY_ADDR", ":9100"),
			ProcessAfter: duration("AGENCY_PROCESS_AFTER_SECONDS", 5, time.Second),
			ApproveAfter: duration("AGENCY_APPROVE_AFTER_SECONDS", 20, time.Second),
			SendAfter:    duration("AGENCY_SEND_AFTER_SECONDS", 45, time.Second),
			ErrorRate:    getFloat("AGENCY_ERROR_RATE", 0.05),
			Latency:      duration("AGENCY_LATENCY_MS", 40, time.Millisecond),
		},
	}

	if c.Env == "dev" {
		if c.DatabaseURL == "" {
			c.DatabaseURL = devDatabaseURL
		}
		if len(c.BankHMACKey) == 0 {
			c.BankHMACKey = []byte(devHMACKey)
		}
		if c.AgencyAPIKey == "" {
			c.AgencyAPIKey = devAgencyKey
		}
		if c.AgencyAdminKey == "" {
			c.AgencyAdminKey = devAgencyAdminKey
		}
		if c.AgencyURLs["irs"] == "" {
			c.AgencyURLs["irs"] = "http://localhost:9101"
		}
		if c.AgencyURLs["ca-ftb"] == "" {
			c.AgencyURLs["ca-ftb"] = "http://localhost:9102"
		}
		if c.AgencyURLs["ny-dtf"] == "" {
			c.AgencyURLs["ny-dtf"] = "http://localhost:9103"
		}
	}
	if c.BatchShardIndex < 0 || c.BatchShardIndex >= c.BatchShards {
		return c, fmt.Errorf("batch shard index %d is outside 0..%d", c.BatchShardIndex, c.BatchShards-1)
	}
	proxies, err := prefixes(get("TRUSTED_PROXIES", defaultTrustedProxies))
	if err != nil {
		return c, fmt.Errorf("TRUSTED_PROXIES: %w", err)
	}
	c.TrustedProxies = proxies
	return c, nil
}

// prefixes parses a comma-separated list of CIDR ranges. A bare address counts as a single host.
func prefixes(list string) ([]netip.Prefix, error) {
	var out []netip.Prefix
	for _, s := range strings.Split(list, ",") {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if !strings.Contains(s, "/") {
			addr, err := netip.ParseAddr(s)
			if err != nil {
				return nil, err
			}
			out = append(out, netip.PrefixFrom(addr, addr.BitLen()))
			continue
		}
		p, err := netip.ParsePrefix(s)
		if err != nil {
			return nil, err
		}
		out = append(out, p.Masked())
	}
	return out, nil
}

// RequireDatabase checks the settings every database-backed command needs. The agency mock
// doesn't need them.
func (c Config) RequireDatabase() error {
	if c.DatabaseURL == "" {
		return fmt.Errorf("DATABASE_URL is required when APP_ENV=%s", c.Env)
	}
	if len(c.BankHMACKey) < 16 {
		return fmt.Errorf("BANK_HMAC_KEY must be at least 16 bytes when APP_ENV=%s", c.Env)
	}
	return nil
}

// RequireAgencies checks the settings needed to call the agencies.
func (c Config) RequireAgencies() error {
	if c.AgencyAPIKey == "" {
		return fmt.Errorf("AGENCY_API_KEY is required")
	}
	for agency, url := range c.AgencyURLs {
		if url == "" {
			return fmt.Errorf("the URL for agency %q is required (AGENCY_%s_URL)", agency, envName(agency))
		}
	}
	return nil
}

func envName(agency string) string {
	b := []byte(agency)
	for i, ch := range b {
		switch {
		case ch == '-':
			b[i] = '_'
		case ch >= 'a' && ch <= 'z':
			b[i] = ch - 32
		}
	}
	return string(b)
}

func get(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func getInt(key string, fallback int) int {
	if v, err := strconv.Atoi(os.Getenv(key)); err == nil {
		return v
	}
	return fallback
}

func duration(key string, fallback int, unit time.Duration) time.Duration {
	return time.Duration(getInt(key, fallback)) * unit
}

func getFloat(key string, fallback float64) float64 {
	if v, err := strconv.ParseFloat(os.Getenv(key), 64); err == nil {
		return v
	}
	return fallback
}

func getBool(key string, fallback bool) bool {
	if v, err := strconv.ParseBool(os.Getenv(key)); err == nil {
		return v
	}
	return fallback
}
