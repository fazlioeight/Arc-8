# Multi-stage Dockerfile for Arc-8 Frontend

# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

ARG REACT_APP_API_BASE=http://localhost:8989
ENV REACT_APP_API_BASE=${REACT_APP_API_BASE}
ENV REACT_APP_DEFAULT_TENANT=prominencehealth
ENV CI=false

RUN npm run build

# Stage 2: Serve
FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
