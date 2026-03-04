FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY HablaMas.sln ./
COPY src/HablaMas.Api/HablaMas.Api.csproj src/HablaMas.Api/
COPY src/HablaMas.Application/HablaMas.Application.csproj src/HablaMas.Application/
COPY src/HablaMas.Domain/HablaMas.Domain.csproj src/HablaMas.Domain/
COPY src/HablaMas.Infrastructure/HablaMas.Infrastructure.csproj src/HablaMas.Infrastructure/

RUN dotnet restore src/HablaMas.Api/HablaMas.Api.csproj

COPY src ./src
RUN dotnet publish src/HablaMas.Api/HablaMas.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

RUN mkdir -p /uploads

COPY --from=build /app/publish .

EXPOSE 8080
ENTRYPOINT ["dotnet", "HablaMas.Api.dll"]
