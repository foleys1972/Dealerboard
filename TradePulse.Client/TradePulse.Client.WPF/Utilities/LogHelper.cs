using System;
using System.Diagnostics;
using System.IO;

namespace TradePulse.Client.WPF.Utilities;

public static class LogHelper
{
    public static string GetLogDirectory()
    {
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "TradePulse",
            "Logs"
        );
    }

    public static string GetLatestLogPath()
    {
        return Path.Combine(GetLogDirectory(), "latest.log");
    }

    public static void OpenLogFolder()
    {
        try
        {
            var logDir = GetLogDirectory();
            if (!Directory.Exists(logDir))
            {
                Directory.CreateDirectory(logDir);
            }
            
            Process.Start("explorer.exe", logDir);
        }
        catch
        {
            // Ignore errors opening folder
        }
    }
}

