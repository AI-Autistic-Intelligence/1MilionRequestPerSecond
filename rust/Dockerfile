FROM rust:alpine AS builder
WORKDIR /app
RUN apk add --no-cache musl-dev
COPY . .
RUN cargo build --release

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/target/release/ferrox-rust .
EXPOSE 8080
CMD ["./ferrox-rust"]
