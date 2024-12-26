@echo off


setlocal enabledelayedexpansion

@REM Path to the file containing variable assignments
echo Current folder: %~dp0
set CURRENT_DIR=%~dp0
set DIR_CONFIG=%CURRENT_DIR%\dir-config.txt

@REM Loop through the file and extract variable values
for /f "usebackq tokens=1,2 delims==" %%a in ("%DIR_CONFIG%") do (
    if "%%a"=="BOT_CONNECTOR_DIR" set "BOT_CONNECTOR_DIR=%%b"
    if "%%a"=="CHAT_BOX_DIR" set "CHAT_BOX_DIR=%%b"
    if "%%a"=="CALLFLOW_BOT_DIR" set "CALLFLOW_BOT_DIR=%%b"
    if "%%a"=="PROXY_ADMIN_PAGE_DIR" set "PROXY_ADMIN_PAGE_DIR=%%b"
    if "%%a"=="PROXY_SERVICE_DIR" set "PROXY_SERVICE_DIR=%%b"
    if "%%a"=="INTENT_SVC_DIR" set "INTENT_SVC_DIR=%%b"
    
    if "%%a"=="BOT_CONNECTOR_SETTING" set "BOT_CONNECTOR_SETTING=%%b"
    if "%%a"=="CHAT_BOX_SETTING" set "CHAT_BOX_SETTING=%%b"
    if "%%a"=="CALLFLOW_BOT_SETTING" set "CALLFLOW_BOT_SETTING=%%b"
    if "%%a"=="PROXY_ADMIN_PAGE_SETTING" set "PROXY_ADMIN_PAGE_SETTING=%%b"
    if "%%a"=="PROXY_SERVICE_SETTING" set "PROXY_SERVICE_SETTING=%%b"
    if "%%a"=="INTENT_SVC_SETTING" set "INTENT_SVC_SETTING=%%b"

    if "%%a"=="IMPORT_NODE_MODULES" set "IMPORT_NODE_MODULES=%%b"

    if "%%a"=="DESTINATION_DIR" set "DESTINATION_DIR=%%b"
    if "%%a"=="CURRENT_DIR" set "CURRENT_DIR=%%b"
    if "%%a"=="BACK_UP_DIR" set "BACK_UP_DIR=%%b"
    	
    if "%%a"=="APACHE_CONFIGURE_DIR" set "APACHE_CONFIGURE_DIR=%%b"
    if "%%a"=="APACHE_RUN_BIN_DIR" set "APACHE_RUN_BIN_DIR=%%b"
)

set EXCLUDE_FILE=%CURRENT_DIR%\exclude.txt
set LOGGER_FILE=%DESTINATION_DIR%\logger.txt


if "%BOT_CONNECTOR_SETTING%"=="1" ( 
    echo Setting for bot connector >> %LOGGER_FILE%
	echo Backup folder from %DESTINATION_DIR%\%BOT_CONNECTOR_DIR% to %BACK_UP_DIR%\%BOT_CONNECTOR_DIR% >> %LOGGER_FILE%
    xcopy %DESTINATION_DIR%\%BOT_CONNECTOR_DIR% %BACK_UP_DIR%\%BOT_CONNECTOR_DIR% /E /I /H /K /Y /exclude:%EXCLUDE_FILE%
	
    echo Copy folder from %CURRENT_DIR%\%BOT_CONNECTOR_DIR% to %DESTINATION_DIR%\%BOT_CONNECTOR_DIR% >> %LOGGER_FILE%
    xcopy %CURRENT_DIR%\%BOT_CONNECTOR_DIR% %DESTINATION_DIR%\%BOT_CONNECTOR_DIR% /E /I /H /K /Y
    
    cd /d "%DESTINATION_DIR%\%BOT_CONNECTOR_DIR%"

    if "%IMPORT_NODE_MODULES%"=="1" (
        echo Install node modules for bot connector >> %LOGGER_FILE%
        call npm install
    )
)

if "%CHAT_BOX_SETTING%"=="1" ( 
    echo Setting for chat box >> %LOGGER_FILE%    
	echo Backup folder from %DESTINATION_DIR%\%BOT_CONNECTOR_DIR%\build to %BACK_UP_DIR%\%BOT_CONNECTOR_DIR%\build >> %LOGGER_FILE%
    xcopy %DESTINATION_DIR%\%BOT_CONNECTOR_DIR%\build %BACK_UP_DIR%\%BOT_CONNECTOR_DIR%\build /E /I /H /K /Y /exclude:%EXCLUDE_FILE%
	
    cd /d %CURRENT_DIR%\%CHAT_BOX_DIR%
    
    if "%IMPORT_NODE_MODULES%"=="1" (
        echo Install node modules for chat box >> %LOGGER_FILE%
        call npm install -f
    )

	echo Run build for chat box >> %LOGGER_FILE%
    call npm run build

	echo Copy folder from %CHAT_BOX_SETTING%\build to %DESTINATION_DIR%\%BOT_CONNECTOR_DIR%\build >> %LOGGER_FILE%
    xcopy .\build %DESTINATION_DIR%\%BOT_CONNECTOR_DIR%\build /E /I /H /K /Y
)

if "%CALLFLOW_BOT_SETTING%"=="1" ( 
	echo Setting for callflow bot >> %LOGGER_FILE%
    echo Backup folder from %DESTINATION_DIR%\%CALLFLOW_BOT_DIR% to %BACK_UP_DIR%\%CALLFLOW_BOT_DIR% >> %LOGGER_FILE%
    xcopy %DESTINATION_DIR%\%CALLFLOW_BOT_DIR% %BACK_UP_DIR%\%CALLFLOW_BOT_DIR% /E /I /H /K /Y /exclude:%EXCLUDE_FILE%
	
	echo Copy folder from %CURRENT_DIR%\%CALLFLOW_BOT_DIR% to %DESTINATION_DIR%\%CALLFLOW_BOT_DIR% >> %LOGGER_FILE%
    xcopy %CURRENT_DIR%\%CALLFLOW_BOT_DIR% %DESTINATION_DIR%\%CALLFLOW_BOT_DIR% /E /I /H /K /Y

    cd /d "%DESTINATION_DIR%\%CALLFLOW_BOT_DIR%"
    
    if "%IMPORT_NODE_MODULES%"=="1" (
        echo Install node modules for callflow bot >> %LOGGER_FILE%
        call npm install
    )
)

if "%PROXY_ADMIN_PAGE_SETTING%"=="1" ( 
	echo Setting for proxy admin page >> %LOGGER_FILE%
    echo Backup folder from %DESTINATION_DIR%\%PROXY_ADMIN_PAGE_DIR% to %BACK_UP_DIR%\%PROXY_ADMIN_PAGE_DIR% >> %LOGGER_FILE%
    xcopy "%DESTINATION_DIR%\%PROXY_ADMIN_PAGE_DIR%" "%BACK_UP_DIR%\%PROXY_ADMIN_PAGE_DIR%" /E /I /H /K /Y /exclude:%EXCLUDE_FILE%
	
    cd /d %CURRENT_DIR%\%PROXY_ADMIN_PAGE_DIR%
    set env=production

	echo Remove old Publish folder >> %LOGGER_FILE%
    rd/s/q "%CURRENT_DIR%\%PROXY_ADMIN_PAGE_DIR%\Publish"
	echo Remove old Source wwwroot folder >> %LOGGER_FILE%
    rd/s/q "%CURRENT_DIR%\%PROXY_ADMIN_PAGE_DIR%\Source\Backend\BackEnd\wwwroot"

    cd /d %CURRENT_DIR%\%PROXY_ADMIN_PAGE_DIR%\Source\FrontEnd
    if "%IMPORT_NODE_MODULES%"=="1" (
        echo Install node modules for admin page front end >> %LOGGER_FILE%
        call npm install -f
    )
	echo Run build for admin page front end >> %LOGGER_FILE%
    call npm run build --c %env%

    echo Run publish for admin page back end >> %LOGGER_FILE%
    dotnet publish "%CURRENT_DIR%\%PROXY_ADMIN_PAGE_DIR%\Source\BackEnd" -o "%CURRENT_DIR%\%PROXY_ADMIN_PAGE_DIR%\Publish\BackEnd"

	echo Copy folder from %CURRENT_DIR%\%PROXY_ADMIN_PAGE_DIR%\Publish to %DESTINATION_DIR%\%PROXY_ADMIN_PAGE_DIR% >> %LOGGER_FILE%
    xcopy "%CURRENT_DIR%\%PROXY_ADMIN_PAGE_DIR%\Publish\BackEnd" "%DESTINATION_DIR%\%PROXY_ADMIN_PAGE_DIR%" /E /I /H /K /Y
)

if "%PROXY_SERVICE_SETTING%"=="1" ( 
	echo Setting for proxy service >> %LOGGER_FILE%
    echo Backup folder from %DESTINATION_DIR%\%PROXY_SERVICE_DIR% to %BACK_UP_DIR%\%PROXY_SERVICE_DIR% >> %LOGGER_FILE%
    xcopy "%DESTINATION_DIR%\%PROXY_SERVICE_DIR%" "%BACK_UP_DIR%\%PROXY_SERVICE_DIR%" /E /I /H /K /Y /exclude:%EXCLUDE_FILE%
    
	echo Copy folder from %CURRENT_DIR%\%PROXY_SERVICE_DIR% to %DESTINATION_DIR%\%PROXY_SERVICE_DIR% >> %LOGGER_FILE%
    xcopy %CURRENT_DIR%\%PROXY_SERVICE_DIR% %DESTINATION_DIR%\%PROXY_SERVICE_DIR% /E /I /H /K /Y

    cd /d "%DESTINATION_DIR%\%PROXY_SERVICE_DIR%"

    if "%IMPORT_NODE_MODULES%"=="1" (
        echo Install node modules for proxy service >> %LOGGER_FILE%
        call npm install
    )
)

if "%INTENT_SVC_SETTING%"=="1" ( 
	echo Setting for intent service >> %LOGGER_FILE%
    echo Backup folder from %DESTINATION_DIR%\%INTENT_SVC_DIR% to %BACK_UP_DIR%\%INTENT_SVC_DIR% >> %LOGGER_FILE%
    xcopy "%DESTINATION_DIR%\%INTENT_SVC_DIR%" "%BACK_UP_DIR%\%INTENT_SVC_DIR%" /E /I /H /K /Y /exclude:%EXCLUDE_FILE%
    
	echo Copy folder from %CURRENT_DIR%\%INTENT_SVC_DIR% to %DESTINATION_DIR%\%INTENT_SVC_DIR% >> %LOGGER_FILE%
    xcopy %CURRENT_DIR%\%INTENT_SVC_DIR% %DESTINATION_DIR%\%INTENT_SVC_DIR% /E /I /H /K /Y

    cd /d "%DESTINATION_DIR%\%INTENT_SVC_DIR%"

    if "%IMPORT_NODE_MODULES%"=="1" (
        echo Install node modules for intent service >> %LOGGER_FILE%
        call npm install
    )
)

echo Installing IIS... >> %LOGGER_FILE%
%systemroot%\system32\inetsrv\appcmd.exe list app >nul 2>&1
if %errorlevel% neq 0 (
    %systemroot%\system32\inetsrv\appcmd.exe /install
) else (
    echo IIS is already installed >> %LOGGER_FILE%
)

echo Installing IISNode... >> %LOGGER_FILE%
set "iisnodePath=C:\Program Files\iisnode\iisnode.dll"
if not exist "%iisnodePath%" (
    echo IISNode is not installed. Download and install IISNode from https://github.com/azure/iisnode and try again.
    pause
    exit /b
) else (
    echo IISNode is already installed >> %LOGGER_FILE%
)

echo Stopping IIS... >> %LOGGER_FILE%
iisreset /stop

echo Removing existing IIS application... >> %LOGGER_FILE%
echo Removing botconnector >> %LOGGER_FILE%
%systemroot%\system32\inetsrv\appcmd.exe delete app "Default Web Site/botconnector" >nul 2>&1
echo Removing call-flow-bot >> %LOGGER_FILE%
%systemroot%\system32\inetsrv\appcmd.exe delete app "Default Web Site/call-flow-bot" >nul 2>&1
echo Removing intentsvc >> %LOGGER_FILE%
%systemroot%\system32\inetsrv\appcmd.exe delete app "Default Web Site/intentsvc" >nul 2>&1
echo Removing proxy-admin >> %LOGGER_FILE%
%systemroot%\system32\inetsrv\appcmd.exe delete app "Default Web Site/proxy-admin" >nul 2>&1
echo Removing twilio-proxy >> %LOGGER_FILE%
%systemroot%\system32\inetsrv\appcmd.exe delete app "Default Web Site/twilio-proxy" >nul 2>&1

echo Creating new IIS application... >> %LOGGER_FILE%
echo Creating botconnector >> %LOGGER_FILE%
%systemroot%\system32\inetsrv\appcmd.exe add app /site.name:"Default Web Site" /path:/botconnector /physicalPath:"%DESTINATION_DIR%\%BOT_CONNECTOR_DIR%"
echo Creating call-flow-bot >> %LOGGER_FILE%
%systemroot%\system32\inetsrv\appcmd.exe add app /site.name:"Default Web Site" /path:/call-flow-bot /physicalPath:"%DESTINATION_DIR%\%CALLFLOW_BOT_DIR%"
echo Creating intentsvc >> %LOGGER_FILE%
%systemroot%\system32\inetsrv\appcmd.exe add app /site.name:"Default Web Site" /path:/intentsvc /physicalPath:"%DESTINATION_DIR%\%INTENT_SVC_DIR%"
echo Creating proxy-admin >> %LOGGER_FILE%
%systemroot%\system32\inetsrv\appcmd.exe add app /site.name:"Default Web Site" /path:/proxy-admin /physicalPath:"%DESTINATION_DIR%\%PROXY_ADMIN_PAGE_DIR%"
echo Creating twilio-proxy >> %LOGGER_FILE%
%systemroot%\system32\inetsrv\appcmd.exe add app /site.name:"Default Web Site" /path:/twilio-proxy /physicalPath:"%DESTINATION_DIR%\%PROXY_SERVICE_DIR%"

echo Starting IIS... >> %LOGGER_FILE%
iisreset /start

echo Deployment completed! >> %LOGGER_FILE%
pause
