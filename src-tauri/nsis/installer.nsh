!macro NSIS_HOOK_PREINSTALL
  ; 打包 WebView2Loader.dll 到安装目录，确保应用能找到它
  ; 路径相对于生成的 NSIS 脚本 (target/release/nsis/x64/installer.nsi)
  File "..\..\WebView2Loader.dll"
!macroend
