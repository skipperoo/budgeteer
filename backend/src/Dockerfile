# -------- Build Stage --------
FROM golang:1.26-alpine AS builder

ENV CGO_ENABLED=0 \
    GOOS=linux \
    GOARCH=amd64

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go build -o budgeteer-backend cmd/budgeteer-backend/main.go

# -------- Runtime Stage --------
FROM alpine:latest

WORKDIR /app

COPY --from=builder /app/budgeteer-backend .
COPY --from=builder /app/migrations ./migrations

EXPOSE 8080

ENTRYPOINT ["./budgeteer-backend"]
