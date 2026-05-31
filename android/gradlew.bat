@rem gradle bootstrap bat stub for Windows hosts
@echo off
set DIRNAME=%~dp0
if "%DIRNAME%" == "" set DIRNAME=.

if not exist "%DIRNAME%gradle\wrapper\gradle-wrapper.jar" (
    echo Downloading wrapper jar...
    powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/gradle/gradle/v8.5.0/gradle/wrapper/gradle-wrapper.jar' -OutFile '%DIRNAME%gradle\wrapper\gradle-wrapper.jar'"
)

java -Dorg.gradle.appname=gradlew -classpath "%DIRNAME%gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*
