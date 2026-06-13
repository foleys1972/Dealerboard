using System;
using System.IO;
using System.Linq;
using System.Text;
using Microsoft.Extensions.Logging;

namespace TradePulse.Dealerboard.Client.Logging;

public class FileLoggerProvider : ILoggerProvider
{
    private readonly string _logFilePath;
    private readonly StreamWriter _writer;
    private readonly object _lock = new object();

    public FileLoggerProvider(string logFilePath)
    {
        _logFilePath = logFilePath;

        // Ensure directory exists
        var directory = Path.GetDirectoryName(logFilePath);
        if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
        {
            Directory.CreateDirectory(directory);
        }

        // Share ReadWrite so a second instance (or a lingering handle) opening the
        // same log doesn't get denied — a locked log file must never be fatal to
        // app startup. Fall back to a per-process log, then to a no-op writer, so
        // logging can never prevent the app from launching.
        _writer = OpenLogWriter(logFilePath)
                  ?? OpenLogWriter(BuildFallbackPath(logFilePath))
                  ?? StreamWriter.Null;
    }

    private static StreamWriter? OpenLogWriter(string path)
    {
        try
        {
            var fileStream = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
            return new StreamWriter(fileStream, Encoding.UTF8) { AutoFlush = true };
        }
        catch
        {
            return null;
        }
    }

    private static string BuildFallbackPath(string logFilePath)
    {
        var dir = Path.GetDirectoryName(logFilePath) ?? ".";
        var name = Path.GetFileNameWithoutExtension(logFilePath);
        var ext = Path.GetExtension(logFilePath);
        return Path.Combine(dir, $"{name}_{Environment.ProcessId}{ext}");
    }

    public ILogger CreateLogger(string categoryName)
    {
        return new FileLogger(categoryName, _writer, _lock);
    }

    public void Dispose()
    {
        _writer?.Dispose();
    }
}

public class FileLogger : ILogger
{
    private readonly string _categoryName;
    private readonly StreamWriter _writer;
    private readonly object _lock;

    public FileLogger(string categoryName, StreamWriter writer, object lockObject)
    {
        _categoryName = categoryName;
        _writer = writer;
        _lock = lockObject;
    }

    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

    public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Information;

    public void Log<TState>(
        LogLevel logLevel,
        EventId eventId,
        TState state,
        Exception? exception,
        Func<TState, Exception?, string> formatter)
    {
        if (!IsEnabled(logLevel))
        {
            return;
        }

        var message = formatter(state, exception);
        var timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
        var level = logLevel.ToString().ToUpper().PadRight(5);
        var logEntry = $"[{timestamp}] [{level}] [{_categoryName}] {message}";

        if (exception != null)
        {
            logEntry += $"\n{exception}";
        }

        lock (_lock)
        {
            _writer.WriteLine(logEntry);
        }
    }
}

