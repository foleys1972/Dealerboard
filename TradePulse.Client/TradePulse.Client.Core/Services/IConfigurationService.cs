namespace TradePulse.Client.Core.Services;

public interface IConfigurationService
{
    string ServerUrl { get; set; }
    string LastUsername { get; set; }
    int ConnectionTimeout { get; }
    int ReconnectionAttempts { get; }
    int ReconnectionDelay { get; }
    bool AllowInsecureCertificates { get; set; }
    void Save();
    void Load();
    T? GetValue<T>(string key);
    void SetValue<T>(string key, T? value);
}

