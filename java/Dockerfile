FROM maven:3.9.6-eclipse-temurin-21-alpine AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline
COPY src ./src
RUN mvn package

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/ferrox-java-1.0-SNAPSHOT-jar-with-dependencies.jar app.jar
EXPOSE 8081
CMD ["java", "-jar", "app.jar"]
