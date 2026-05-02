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
RUN mkdir -p /app/logs && \
    chown -R app:app /app && \
    chmod 755 /app && \
    chmod 777 /app/logs
USER app

# =================
# Build
# =================
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src

COPY ["SunnydaleLibrary.csproj", "./"]
RUN dotnet restore "./SunnydaleLibrary.csproj"

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
