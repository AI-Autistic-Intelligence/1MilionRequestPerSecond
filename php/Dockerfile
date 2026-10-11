FROM phpswoole/swoole:5.1-php8.3-alpine
WORKDIR /app
RUN apk add --no-cache pcre-dev postgresql-dev $PHPIZE_DEPS \
    && docker-php-ext-install pdo pdo_pgsql \
    && pecl install redis || true \
    && docker-php-ext-enable redis pdo_pgsql || true
COPY server.php .
EXPOSE 8082
CMD ["php", "server.php"]
