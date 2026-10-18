!macro customCheckAppRunning
  DetailPrint "Terminating any running instances of ${APP_EXECUTABLE_FILENAME}..."
  nsExec::Exec 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}"'
  Sleep 1500
!macroend
