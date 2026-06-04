# =================================================
# Multi-stage Dockerfile for SunnydaleLibrary
# =================================================

# =================
# Base
# =================
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS base
WORKDIR /app
EXPOSE 8080

USER root
# curl is used by the container HEALTHCHECK to probe /healthz.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /app/logs /app/data && \
    chown -R app:app /app && \
    chmod 755 /app && \
    chmod 777 /app/logs /app/data
USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8080/healthz || exit 1

# =================
# Build
# =================
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src

# Node.js is needed by the CompileGameTypeScript MSBuild target (tsc).
RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# Restore .NET and Node deps first for better layer caching.
COPY ["SunnydaleLibrary.csproj", "./"]
RUN dotnet restore "./SunnydaleLibrary.csproj"
COPY ["package.json", "tsconfig.json", "./"]
RUN npm install --no-audit --no-fund

COPY . .
RUN dotnet build "./SunnydaleLibrary.csproj" -c $BUILD_CONFIGURATION -o /app/build

# =================
# Publish
# =================
FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./SunnydaleLibrary.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

# =================
# Final
# =================
FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
USER app

ENTRYPOINT ["dotnet", "SunnydaleLibrary.dll"]
