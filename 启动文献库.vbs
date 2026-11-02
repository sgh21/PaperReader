Option Explicit
Dim fso, shell, root, python, server, quote
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
python = fso.BuildPath(root, ".venv\Scripts\pythonw.exe")
server = fso.BuildPath(root, "tools\library_server.py")
If Not fso.FileExists(python) Then
  MsgBox "Python environment not found: " & python, 16, "Paper Reader"
  WScript.Quit 1
End If
quote = Chr(34)
shell.Run quote & python & quote & " " & quote & server & quote, 0, False
