using System;
using System.IO;
using System.Linq;
using System.Text;
using Microsoft.Extensions.Logging;

namespace TradePulse.Client.WPF.Logging;

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

        // Open file in append mode
        var fileStream = new FileStream(logFilePath, FileMode.Append, FileAccess.Write, FileShare.Read);
        _writer = new StreamWriter(fileStream, Encoding.UTF8)
        {
            AutoFlush = true
        };
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
        var logLevelStr = logLevel.ToString().ToUpper().PadRight(5);
        var timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
        var category = _categoryName.Split('.').LastOrDefault() ?? _categoryName;

        lock (_lock)
        {
            _writer.WriteLine($"[{timestamp}] [{logLevelStr}] [{category}] {message}");
            
            if (exception != null)
            {
                _writer.WriteLine($"Exception: {exception.GetType().Name}: {exception.Message}");
                if (exception.StackTrace != null)
                {
                    _writer.WriteLine($"StackTrace: {exception.StackTrace}");
                }
                if (exception.InnerException != null)
                {
                    _writer.WriteLine($"Inner Exception: {exception.InnerException.GetType().Name}: {exception.InnerException.Message}");
                }
            }
        }
    }
}

