; 素言安装器的轻量品牌层：保留 electron-builder 的安装逻辑，只调整页面文案与页眉。
; 图片资源由 package-win.cjs 在 stage 阶段生成，避免把设计工具链带进安装包。

!ifndef BUILD_UNINSTALLER
  !define MUI_WELCOMEPAGE_TITLE "欢迎来到素言"
  !define MUI_WELCOMEPAGE_TEXT "把灵感安顿好，顺手把好看的图也带回家。素言会把本地提示词、图片和设置稳稳放在你的电脑里。"
  !define MUI_DIRECTORYPAGE_TEXT_TOP "给素言挑个小窝"
  !define MUI_DIRECTORYPAGE_TEXT_DESTINATION "素言会住在这个文件夹里"
  !define MUI_INSTFILESPAGE_FINISHHEADER_TEXT "安顿完成，开始收集灵感吧"
  !define MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT "小书架已经摆好，下一步就可以打开素言。"
!else
  !define MUI_PAGE_HEADER_TEXT "正在替素言收拾行李"
  !define MUI_PAGE_HEADER_SUBTEXT "很快就好，重要素材请记得提前导出备份。"
  !define MUI_UNWELCOMEPAGE_TITLE "要和素言暂时告别吗？"
  !define MUI_UNWELCOMEPAGE_TEXT "如果只是想升级，直接安装新版本就好，不必先卸载。确定要离开的话，下一步就开始收拾。"
  !define MUI_UNFINISHPAGE_TITLE "素言已经收拾好啦"
  !define MUI_UNFINISHPAGE_TEXT "这次先告别到这里。安装目录和其中的本地数据已经移除，重要素材请在卸载前导出备份。"
!endif

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "安顿完成，开始收集灵感吧"
  !define MUI_FINISHPAGE_TEXT "素言已经准备好，去看看你的新小书架吧。"
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "安装好啦，打开素言"
  !define MUI_FINISHPAGE_RUN_FUNCTION "SuyanStartApp"

  Function SuyanStartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

!ifndef BUILD_UNINSTALLER
  !macro customPageAfterChangeDir
    !define MUI_PAGE_HEADER_TEXT "正在把灵感一件件搬进来"
    !define MUI_PAGE_HEADER_SUBTEXT "请稍等，素言正在整理自己的小书架。"
  !macroend

  !macro customInstall
    ; 安装页底部状态在文件复制完成后仍给出一条更有温度的反馈。
    FindWindow $0 "#32770" "" $HWNDPARENT
    GetDlgItem $0 $0 1000
    SendMessage $0 ${WM_SETTEXT} 0 "STR:素言已经把灵感安顿好啦。"
  !macroend
!else
  !macro customUnInstall
    FindWindow $0 "#32770" "" $HWNDPARENT
    GetDlgItem $0 $0 1000
    SendMessage $0 ${WM_SETTEXT} 0 "STR:正在替素言收拾行李，请稍等。"
  !macroend
!endif
