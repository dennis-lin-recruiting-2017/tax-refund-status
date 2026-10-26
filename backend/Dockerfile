# syntax=docker/dockerfile:1
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/taxrefund ./cmd/taxrefund

# Distroless static: no shell or package manager, runs as non-root.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/taxrefund /taxrefund
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/taxrefund"]
CMD ["serve"]
