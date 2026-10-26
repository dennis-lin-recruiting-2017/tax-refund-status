// Package telemetry configures OpenTelemetry tracing, exported over OTLP to Jaeger.
//
// Tracing is on when OTEL_EXPORTER_OTLP_ENDPOINT (or ..._TRACES_ENDPOINT) is set, and a
// no-op otherwise, so the binary runs the same with or without a collector.
package telemetry

import (
	"context"
	"os"
	"strconv"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
	"go.opentelemetry.io/otel/trace/noop"
)

// Enabled reports whether an OTLP endpoint is configured.
func Enabled() bool {
	return os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT") != "" || os.Getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT") != ""
}

// Provider is a tracer provider plus the function that flushes and stops it.
type Provider struct {
	trace.TracerProvider
	Shutdown func(context.Context) error
}

// NewProvider builds a tracer provider that reports as the given service. Most processes need
// one; `taxrefund all` builds one per in-process service so each shows up separately in Jaeger.
func NewProvider(ctx context.Context, service, env string) (Provider, error) {
	if !Enabled() {
		return Provider{TracerProvider: noop.NewTracerProvider(), Shutdown: func(context.Context) error { return nil }}, nil
	}
	exp, err := otlptracehttp.New(ctx) // endpoint, headers, and TLS come from the standard OTEL_* env vars
	if err != nil {
		return Provider{}, err
	}
	res, err := resource.New(ctx,
		resource.WithFromEnv(),
		resource.WithTelemetrySDK(),
		resource.WithAttributes(
			attribute.String("service.name", service),
			attribute.String("deployment.environment.name", env),
		),
	)
	if err != nil {
		return Provider{}, err
	}
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(sampleRatio()))),
	)
	return Provider{TracerProvider: tp, Shutdown: tp.Shutdown}, nil
}

// Init sets the global propagator (W3C trace context) and, optionally, the global provider.
func Init(p Provider) {
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))
	otel.SetTracerProvider(p.TracerProvider)
}

// sampleRatio reads TRACE_SAMPLE_RATIO (default 1.0: keep every trace, fine for a demo).
// At production volume this would be a few percent, with tail sampling in a collector.
func sampleRatio() float64 {
	if v, err := strconv.ParseFloat(os.Getenv("TRACE_SAMPLE_RATIO"), 64); err == nil && v >= 0 && v <= 1 {
		return v
	}
	return 1
}
