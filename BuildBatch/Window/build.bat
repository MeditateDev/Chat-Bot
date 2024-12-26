@echo off
setlocal enabledelayedexpansion

@REM Path to the file containing variable assignments
echo ===== Current folder: %~dp0
set CURRENT_DIR=%~dp0
set DIR_CONFIG=%CURRENT_DIR%\build-configure.txt

set LIST_FILE=build-configure.txt
for %%a in (%LIST_FILE%) do (
	cd /d "%CURRENT_DIR%"
	if not exist %%a (
		echo ===== Not found file %%a. Please add the file %%a
		endlocal
		pause
		exit /b 0
	)
)

@REM Loop through the file and extract variable values
for /f "usebackq tokens=1,2 delims==" %%a in ("%DIR_CONFIG%") do (
    if "%%a"=="BOT_CONNECTOR_DIR" set "BOT_CONNECTOR_DIR=%%b"
    if "%%a"=="CHAT_BOX_DIR" set "CHAT_BOX_DIR=%%b"
    if "%%a"=="CALLFLOW_BOT_DIR" set "CALLFLOW_BOT_DIR=%%b"
    if "%%a"=="PROXY_ADMIN_PAGE_DIR" set "PROXY_ADMIN_PAGE_DIR=%%b"
    if "%%a"=="PROXY_SERVICE_DIR" set "PROXY_SERVICE_DIR=%%b"
    if "%%a"=="INTENT_SVC_DIR" set "INTENT_SVC_DIR=%%b"
    if "%%a"=="DEPLOY_BATCH_DIR" set "DEPLOY_BATCH_DIR=%%b"
    
    if "%%a"=="INSTALL_BOT_CONNECTOR" set "INSTALL_BOT_CONNECTOR=%%b"
    if "%%a"=="INSTALL_CHAT_BOX" set "INSTALL_CHAT_BOX=%%b"
    if "%%a"=="INSTALL_CALLFLOW_BOT" set "INSTALL_CALLFLOW_BOT=%%b"
    if "%%a"=="INSTALL_PROXY_ADMIN_PAGE" set "INSTALL_PROXY_ADMIN_PAGE=%%b"
    if "%%a"=="INSTALL_PROXY_SERVICE" set "INSTALL_PROXY_SERVICE=%%b"
    if "%%a"=="INSTALL_INTENT_SVC" set "INSTALL_INTENT_SVC=%%b"
    if "%%a"=="INSTALL_DEPLOY_BATCH" set "INSTALL_DEPLOY_BATCH=%%b"

    if "%%a"=="DESTINATION_DIR" set "DESTINATION_DIR=%%b"
    if "%%a"=="CURRENT_DIR" set "CURRENT_DIR=%%b"
)

cd /d "%CURRENT_DIR%"
set LIST_MK_DIR=DESTINATION_DIR
for %%a in (%LIST_MK_DIR%) do ( 
	cd /d "%CURRENT_DIR%"
	if not exist !%%a! (
		echo ===== Create folder !%%a!
		mkdir !%%a!
	)
)

if not exist "%DESTINATION_DIR%" mkdir "%DESTINATION_DIR%"

set "excluded="

if exist exclude.txt (
	set EXCLUDE_FILE=%CURRENT_DIR%\exclude.txt
	::
	for /f "usebackq tokens=*" %%a in ("exclude.txt") do (
		set "excluded=!excluded!%%a "
	)
)
set LOGGER_FILE=%CURRENT_DIR%\logger.txt

if "%INSTALL_BOT_CONNECTOR%"=="1" (
	cd /d "%CURRENT_DIR%"
	if "%BOT_CONNECTOR_DIR%"=="" (
		echo ===== BOT_CONNECTOR_DIR invalid. Please enter a value for variable BOT_CONNECTOR_DIR
		endlocal
		pause
		exit /b 0
	)

	if not exist "%BOT_CONNECTOR_DIR%" (
		echo ===== Not found folder %BOT_CONNECTOR_DIR%. Please enter the correct path for BOT_CONNECTOR_DIR
		endlocal
		pause
		exit /b 0
	)

	echo ===== Install for bot connector
	echo Install for bot connector >> %LOGGER_FILE%
	
	echo ===== Copy folder from %BOT_CONNECTOR_DIR% to %DESTINATION_DIR%\Connector
	echo Copy folder from %BOT_CONNECTOR_DIR% to %DESTINATION_DIR%\Connector >> %LOGGER_FILE%
	
	if "%EXCLUDE_FILE%"=="" (
   		xcopy "%BOT_CONNECTOR_DIR%" "%DESTINATION_DIR%\Connector" /E /I /H /K /Y
	) else (
		::xcopy "%BOT_CONNECTOR_DIR%" "%DESTINATION_DIR%\Connector" /E /I /H /K /Y /exclude:%EXCLUDE_FILE%
		robocopy "%BOT_CONNECTOR_DIR%" "%DESTINATION_DIR%\Connector" /S /E /XD %excluded% /XF %excluded%
	)
)

if "%INSTALL_CHAT_BOX%"=="1" (
	cd /d "%CURRENT_DIR%"
	if "%CHAT_BOX_DIR%"=="" (
		echo ===== CHAT_BOX_DIR invalid. Please enter a value for variable CHAT_BOX_DIR
		endlocal
		pause
		exit /b 0
	)

	if not exist "%CHAT_BOX_DIR%" (
		echo ===== Not found folder %CHAT_BOX_DIR%. Please enter the correct path for CHAT_BOX_DIR
		endlocal
		pause
		exit /b 0
	)

	echo ===== Install for chat box
	echo Install for chat box >> %LOGGER_FILE%
	
	cd /d "%CHAT_BOX_DIR%"
	
	echo ===== Install node modules for chat box
	echo Install node modules for chat box >> %LOGGER_FILE%
	call npm install --legacy-peer-deps

	echo ===== Run build for chat box
	echo Run build for chat box >> %LOGGER_FILE%
	call npm run build

	cd /d "%CURRENT_DIR%"
	echo ===== Copy folder from %CHAT_BOX_DIR%\build to %DESTINATION_DIR%\Connector\build
	echo Copy folder from %CHAT_BOX_DIR%\build to %DESTINATION_DIR%\Connector\build >> %LOGGER_FILE%
	if "%EXCLUDE_FILE%"=="" (
   		xcopy "%CHAT_BOX_DIR%\build" "%DESTINATION_DIR%\Connector\build" /E /I /H /K /Y
	) else (
		::xcopy "%CHAT_BOX_DIR%\build" "%DESTINATION_DIR%\Connector\build" /E /I /H /K /Y /exclude:%EXCLUDE_FILE%
		robocopy "%CHAT_BOX_DIR%\build" "%DESTINATION_DIR%\Connector\build" /S /E /XD %excluded% /XF %excluded%
	)
)

if "%INSTALL_CALLFLOW_BOT%"=="1" (
	cd /d "%CURRENT_DIR%"
	if "%CALLFLOW_BOT_DIR%"=="" (
		echo ===== CALLFLOW_BOT_DIR invalid. Please enter a value for variable CALLFLOW_BOT_DIR
		endlocal
		pause
		exit /b 0
	)

	if not exist "%CALLFLOW_BOT_DIR%" (
		echo ===== Not found folder %CALLFLOW_BOT_DIR%. Please enter the correct path for CALLFLOW_BOT_DIR
		endlocal
		pause
		exit /b 0
	)
	echo ===== Install for callflow bot
	echo Install for callflow bot >> %LOGGER_FILE%
	
	echo ===== Copy folder from %CALLFLOW_BOT_DIR% to %DESTINATION_DIR%\cal-callflow-bot
	echo Copy folder from %CALLFLOW_BOT_DIR% to %DESTINATION_DIR%\cal-callflow-bot >> %LOGGER_FILE%
	if "%EXCLUDE_FILE%"=="" (
   		xcopy "%CALLFLOW_BOT_DIR%" "%DESTINATION_DIR%\cal-callflow-bot" /E /I /H /K /Y
	) else (
		::xcopy "%CALLFLOW_BOT_DIR%" "%DESTINATION_DIR%\cal-callflow-bot" /E /I /H /K /Y /exclude:%EXCLUDE_FILE%
		robocopy "%CALLFLOW_BOT_DIR%" "%DESTINATION_DIR%\cal-callflow-bot" /S /E /XD %excluded% /XF %excluded%
	)
)
if "%INSTALL_PROXY_ADMIN_PAGE%"=="1" (
	cd /d "%CURRENT_DIR%"
	if "%PROXY_ADMIN_PAGE_DIR%"=="" (
		echo ===== PROXY_ADMIN_PAGE_DIR invalid. Please enter a value for variable PROXY_ADMIN_PAGE_DIR
		endlocal
		pause
		exit /b 0
	)

	if not exist "%PROXY_ADMIN_PAGE_DIR%" (
		echo ===== Not found folder "%PROXY_ADMIN_PAGE_DIR%." Please enter the correct path for PROXY_ADMIN_PAGE_DIR
		endlocal
		pause
		exit /b 0
	)

	echo ===== Install for proxy admin page 
	echo Install for proxy admin page >> %LOGGER_FILE%

	set env=production
	
	echo ===== Remove old Publish folder 
	echo Remove old Publish folder >> %LOGGER_FILE%
	rd/s/q "%PROXY_ADMIN_PAGE_DIR%\Publish"
	echo ===== Remove old Source wwwroot folder
	echo Remove old Source wwwroot folder >> %LOGGER_FILE%
	rd/s/q "%PROXY_ADMIN_PAGE_DIR%\Source\Backend\BackEnd\wwwroot"

	cd /d "%CURRENT_DIR%"
	cd /d "%PROXY_ADMIN_PAGE_DIR%\Source\FrontEnd"
	
	echo ===== Install node modules for admin page front end
	echo Install node modules for admin page front end >> %LOGGER_FILE%
	call npm install -f
		
	echo ===== Run build for admin page front end 
	echo Run build for admin page front end >> %LOGGER_FILE%
	call npm run build --c %env%

	echo ===== Run publish for admin page back end
	echo Run publish for admin page back end >> %LOGGER_FILE%
	
	cd /d "%CURRENT_DIR%"
	dotnet publish -c Release "%PROXY_ADMIN_PAGE_DIR%\Source\BackEnd" -o "%PROXY_ADMIN_PAGE_DIR%\Publish\BackEnd"

	echo ===== Copy folder from %PROXY_ADMIN_PAGE_DIR%\Publish to %DESTINATION_DIR%
	echo Copy folder from %PROXY_ADMIN_PAGE_DIR%\Publish to %DESTINATION_DIR% >> %LOGGER_FILE%
	if "%EXCLUDE_FILE%"=="" (
   		xcopy "%PROXY_ADMIN_PAGE_DIR%\Publish" "%DESTINATION_DIR%" /E /I /H /K /Y
	) else (
		::xcopy "%PROXY_ADMIN_PAGE_DIR%\Publish" "%DESTINATION_DIR%" /E /I /H /K /Y /exclude:%EXCLUDE_FILE%
		robocopy "%PROXY_ADMIN_PAGE_DIR%" "%DESTINATION_DIR%" /S /E /XD %excluded% /XF %excluded%
	)
)

if "%INSTALL_PROXY_SERVICE%"=="1" (	
	cd /d "%CURRENT_DIR%"
	if "%PROXY_SERVICE_DIR%"=="" (
		echo ===== PROXY_SERVICE_DIR invalid. Please enter a value for variable PROXY_SERVICE_DIR
		endlocal
		pause
		exit /b 0
	)

	if not exist "%PROXY_SERVICE_DIR%" (
		echo ===== Not found folder %PROXY_SERVICE_DIR%. Please enter the correct path for PROXY_SERVICE_DIR
		endlocal
		pause
		exit /b 0
	)

	echo ===== Install for proxy service
	echo Install for proxy service >> %LOGGER_FILE%

	echo ===== Copy folder from %PROXY_SERVICE_DIR% to %DESTINATION_DIR%\Proxy
	echo Copy folder from %PROXY_SERVICE_DIR% to %DESTINATION_DIR%\Proxy >> %LOGGER_FILE%
	if "%EXCLUDE_FILE%"=="" (
   		xcopy "%PROXY_SERVICE_DIR%" "%DESTINATION_DIR%\Proxy" /E /I /H /K /Y
	) else (
		::xcopy "%PROXY_SERVICE_DIR%" "%DESTINATION_DIR%\Proxy" /E /I /H /K /Y /exclude:%EXCLUDE_FILE%
		robocopy "%PROXY_SERVICE_DIR%" "%DESTINATION_DIR%\Proxy" /S /E /XD %excluded% /XF %excluded%
	)
)

if "%INSTALL_INTENT_SVC%"=="1" (	
	cd /d "%CURRENT_DIR%"
	if "%INTENT_SVC_DIR%"=="" (
		echo ===== INTENT_SVC_DIR invalid. Please enter a value for variable INTENT_SVC_DIR
		endlocal
		pause
		exit /b 0
	)

	if not exist "%INTENT_SVC_DIR%" (
		echo ===== Not found folder %INTENT_SVC_DIR%. Please enter the correct path for INTENT_SVC_DIR
		endlocal
		pause
		exit /b 0
	)

	echo ===== Install for intent service
	echo Install for intent service >> %LOGGER_FILE%%

	echo ===== Copy folder from %INTENT_SVC_DIR% to %DESTINATION_DIR%\cal-intent-svc
	echo Copy folder from %INTENT_SVC_DIR% to %DESTINATION_DIR%\cal-intent-svc >> %LOGGER_FILE%
	if "%EXCLUDE_FILE%"=="" (
   		xcopy "%INTENT_SVC_DIR%" "%DESTINATION_DIR%\cal-intent-svc" /E /I /H /K /Y
	) else (
		::xcopy "%INTENT_SVC_DIR%" "%DESTINATION_DIR%\cal-intent-svc" /E /I /H /K /Y /exclude:%EXCLUDE_FILE%
		robocopy "%INTENT_SVC_DIR%" "%DESTINATION_DIR%\cal-intent-svc" /S /E /XD %excluded% /XF %excluded%
	)
)

if "%INSTALL_DEPLOY_BATCH%"=="1" (	
	cd /d "%CURRENT_DIR%"
	if "%DEPLOY_BATCH_DIR%"=="" (
		echo ===== DEPLOY_BATCH_DIR invalid. Please enter a value for variable DEPLOY_BATCH_DIR
		endlocal
		pause
		exit /b 0
	)

	if not exist "%DEPLOY_BATCH_DIR%" (
		echo ===== Not found folder %DEPLOY_BATCH_DIR%. Please enter the correct path for DEPLOY_BATCH_DIR
		endlocal
		pause
		exit /b 0
	)
	call powershell -Command "(Get-Content -Raw -Path '%DEPLOY_BATCH_DIR%\centOSinstaller.sh') -replace \"`r`n\", \"`n\" | Set-Content -Path '%DEPLOY_BATCH_DIR%\centOSinstaller.sh'"
	call powershell -Command "(Get-Content -Raw -Path '%DEPLOY_BATCH_DIR%\config.txt') -replace \"`r`n\", \"`n\" | Set-Content -Path '%DEPLOY_BATCH_DIR%\config.txt'"
	call powershell -Command "(Get-Content -Raw -Path '%DEPLOY_BATCH_DIR%\installdep.sh') -replace \"`r`n\", \"`n\" | Set-Content -Path '%DEPLOY_BATCH_DIR%\installdep.sh'"
	call powershell -Command "(Get-Content -Raw -Path '%DEPLOY_BATCH_DIR%\installer.sh') -replace \"`r`n\", \"`n\" | Set-Content -Path '%DEPLOY_BATCH_DIR%\installer.sh'"

	echo ===== Install for file deploy batch
	echo Install for file deploy batch >> %LOGGER_FILE%

	echo ===== Copy folder from %DEPLOY_BATCH_DIR% to %DESTINATION_DIR%
	echo Copy folder from %DEPLOY_BATCH_DIR% to %DESTINATION_DIR% >> %LOGGER_FILE%
	if "%EXCLUDE_FILE%"=="" (
   		xcopy "%DEPLOY_BATCH_DIR%" "%DESTINATION_DIR%" /E /I /H /K /Y
	) else (
		::xcopy "%DEPLOY_BATCH_DIR%" "%DESTINATION_DIR%" /E /I /H /K /Y /exclude:%EXCLUDE_FILE%
		robocopy "%DEPLOY_BATCH_DIR%" "%DESTINATION_DIR%" /S /E /XD %excluded% /XF %excluded%
	)
)

cd /d "%CURRENT_DIR%"
echo ===== Zip folder %DESTINATION_DIR%
echo Zip folder %DESTINATION_DIR% >> %LOGGER_FILE%
cd /d "%DESTINATION_DIR%"
powershell Compress-Archive -Path ./ -DestinationPath ../build.zip -Force

echo ===== Build script run successfully
endlocal
pause
exit /b 0