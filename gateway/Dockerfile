FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git

# Copy go module manifests
COPY gateway/go.mod gateway/go.sum ./
RUN go mod download

# Copy source
COPY gateway/ ./

# Build
RUN CGO_ENABLED=0 GOOS=linux go build -o gateway .

FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

COPY --from=builder /app/gateway .

EXPOSE 8080

CMD ["./gateway"]

