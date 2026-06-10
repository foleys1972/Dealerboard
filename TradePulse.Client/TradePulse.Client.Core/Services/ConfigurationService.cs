using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace TradePulse.Client.Core.Services;

public class ConfigurationService : IConfigurationService
{
    private readonly ILogger<ConfigurationService> _logger;
    private readonly string _configPath;
    private ConfigurationData _config;
    private static readonly object _saveLock = new();

    public string ServerUrl
    {
        get => _config.ServerUrl;
        set
        {
            if (_config.ServerUrl != value)
            {
                _config.ServerUrl = value;
                // Don't auto-save on every change - let caller decide when to save
            }
        }
    }

    public string LastUsername
    {
        get => _config.LastUsername ?? string.Empty;
        set
        {
            if (_config.LastUsername != value)
            {
                _config.LastUsername = value;
                // Don't auto-save on every change - let caller decide when to save
            }
        }
    }

    public int ConnectionTimeout => _config.ConnectionTimeout;
    public int ReconnectionAttempts => _config.ReconnectionAttempts;
    public int ReconnectionDelay => _config.ReconnectionDelay;
    public bool AllowInsecureCertificates
    {
        get => _config.AllowInsecureCertificates;
        set
        {
            if (_config.AllowInsecureCertificates != value)
            {
                _config.AllowInsecureCertificates = value;
                // Don't auto-save on every change - let caller decide when to save
            }
        }
    }

    public ConfigurationService(ILogger<ConfigurationService> logger)
    {
        _logger = logger;
        
        // Store config in AppData
        var appDataPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "TradeCom",
            "config.json"
        );
        
        var configDir = Path.GetDirectoryName(appDataPath);
        if (!string.IsNullOrEmpty(configDir) && !Directory.Exists(configDir))
        {
            Directory.CreateDirectory(configDir);
        }
        
        _configPath = appDataPath;
        _config = new ConfigurationData();
        Load();
    }

    public void Load()
    {
        try
        {
            if (File.Exists(_configPath))
            {
                var json = File.ReadAllText(_configPath);
                _config = JsonSerializer.Deserialize<ConfigurationData>(json) ?? new ConfigurationData();
                _logger.LogInformation("Configuration loaded from {Path}", _configPath);
            }
            else
            {
                // Try to load from appsettings.json in the application directory
                var appSettingsPath = Path.Combine(
                    AppDomain.CurrentDomain.BaseDirectory,
                    "appsettings.json"
                );
                
                if (File.Exists(appSettingsPath))
                {
                    var json = File.ReadAllText(appSettingsPath);
                    _config = JsonSerializer.Deserialize<ConfigurationData>(json) ?? new ConfigurationData();
                    _logger.LogInformation("Configuration loaded from appsettings.json");
                }
                else
                {
                    // Default configuration
                    _config = new ConfigurationData
                    {
                        ServerUrl = "https://localhost:5000",
                        ConnectionTimeout = 30,
                        ReconnectionAttempts = 10,
                        ReconnectionDelay = 2000,
                        AllowInsecureCertificates = false
                    };
                    _logger.LogInformation("Using default configuration");
                }
            }

            _config.ServerUrl = ServerUrlHelper.Normalize(_config.ServerUrl);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load configuration, using defaults");
            _config = new ConfigurationData
            {
                ServerUrl = "https://localhost:5000",
                ConnectionTimeout = 30,
                ReconnectionAttempts = 10,
                ReconnectionDelay = 2000,
                AllowInsecureCertificates = false
            };
        }
    }

    public void Save()
    {
        try
        {
            var json = JsonSerializer.Serialize(_config, new JsonSerializerOptions { WriteIndented = true });

            lock (_saveLock)
            {
                const int maxAttempts = 5;
                for (int attempt = 1; attempt <= maxAttempts; attempt++)
                {
                    try
                    {
                        var dir = Path.GetDirectoryName(_configPath);
                        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                        {
                            Directory.CreateDirectory(dir);
                        }

                        var tmpPath = _configPath + ".tmp";

                        // Write temp first, then atomically replace.
                        File.WriteAllText(tmpPath, json);

                        try
                        {
                            // File.Replace is atomic on Windows when target exists.
                            if (File.Exists(_configPath))
                            {
                                File.Replace(tmpPath, _configPath, null);
                            }
                            else
                            {
                                File.Move(tmpPath, _configPath);
                            }
                        }
                        finally
                        {
                            try
                            {
                                if (File.Exists(tmpPath)) File.Delete(tmpPath);
                            }
                            catch { }
                        }

                        _logger.LogInformation("Configuration saved to {Path}", _configPath);
                        return;
                    }
                    catch (IOException ex) when (attempt < maxAttempts)
                    {
                        // Another process/thread is writing; backoff and retry.
                        _logger.LogWarning(ex, "Config save attempt {Attempt}/{Max} failed due to file lock; retrying...", attempt, maxAttempts);
                        Thread.Sleep(50 * attempt);
                    }
                }
            }

            _logger.LogError("Failed to save configuration after retries");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save configuration");
        }
    }

    public T? GetValue<T>(string key)
    {
        if (_config.ExtraSettings != null && _config.ExtraSettings.TryGetValue(key, out var value))
        {
            try
            {
                if (value == null) return default;
                
                // Handle JsonElement from deserialization
                if (value is JsonElement jsonElement)
                {
                    return JsonSerializer.Deserialize<T>(jsonElement.GetRawText());
                }
                
                // Handle direct type conversion
                if (value is T directValue)
                {
                    return directValue;
                }
                
                // Try to convert
                return (T?)Convert.ChangeType(value, typeof(T));
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to get value for key {Key}", key);
                return default;
            }
        }
        return default;
    }

    public void SetValue<T>(string key, T? value)
    {
        if (_config.ExtraSettings == null)
        {
            _config.ExtraSettings = new Dictionary<string, object?>();
        }
        _config.ExtraSettings[key] = value;
    }

    private class ConfigurationData
    {
        public string ServerUrl { get; set; } = "https://localhost:5000";
        public string? LastUsername { get; set; }
        public int ConnectionTimeout { get; set; } = 30;
        public int ReconnectionAttempts { get; set; } = 10;
        public int ReconnectionDelay { get; set; } = 2000;
        public bool AllowInsecureCertificates { get; set; } = false;
        public Dictionary<string, object?>? ExtraSettings { get; set; }
    }
}

