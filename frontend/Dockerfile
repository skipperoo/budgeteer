# -------- Build Stage --------
FROM node:22-alpine AS builder

ARG VITE_BUDGETEER_DEBUG_CONSOLE=0
ENV VITE_BUDGETEER_DEBUG_CONSOLE=$VITE_BUDGETEER_DEBUG_CONSOLE

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

# -------- Runtime Stage --------
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://backend:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        try_files $uri /index.html;
    }
}
EOF

EXPOSE 80
