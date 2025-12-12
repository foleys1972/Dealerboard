using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public class MediaSoupService : IMediaSoupService, IDisposable
{
    private readonly ILogger<MediaSoupService> _logger;
    private readonly HttpClient _httpClient;
    private readonly IAuthService _authService;
    private readonly IConfigurationService _configService;
    private bool _isInitialized = false;
    private bool _isConnected = false;
    private object? _rtpCapabilities;
    private readonly Dictionary<string, MediaSoupTransport> _transports = new();
    private readonly Dictionary<string, MediaSoupProducer> _producers = new();
    private readonly Dictionary<string, MediaSoupConsumer> _consumers = new();

    public bool IsInitialized => _isInitialized;
    public bool IsConnected => _isConnected;

    public event EventHandler<bool>? ConnectionStateChanged;
    public event EventHandler<string>? Error;

    public MediaSoupService(
        ILogger<MediaSoupService> logger,
        HttpClient httpClient,
        IAuthService authService,
        IConfigurationService configService)
    {
        _logger = logger;
        _httpClient = httpClient;
        _authService = authService;
        _configService = configService;
    }

    public async Task InitializeAsync()
    {
        if (_isInitialized)
        {
            return;
        }

        try
        {
            _logger.LogInformation("Initializing MediaSoup client...");

            // Get RTP capabilities from server
            var request = new HttpRequestMessage(HttpMethod.Get, $"{_configService.ServerUrl}/api/webrtc/rtp-capabilities");
            
            if (!string.IsNullOrEmpty(_authService.AuthToken))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _authService.AuthToken);
            }

            var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            _rtpCapabilities = JsonSerializer.Deserialize<object>(json);

            _isInitialized = true;
            _logger.LogInformation("MediaSoup client initialized successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize MediaSoup client");
            Error?.Invoke(this, $"Failed to initialize MediaSoup: {ex.Message}");
            throw;
        }
    }

    public async Task<MediaSoupTransport> CreateTransportAsync(string direction = "sendrecv", string? groupId = null)
    {
        if (!_isInitialized)
        {
            await InitializeAsync();
        }

        try
        {
            _logger.LogInformation("Creating MediaSoup transport: Direction={Direction}, GroupId={GroupId}", direction, groupId);

            var requestBody = new
            {
                direction,
                groupId = groupId ?? "global"
            };

            var request = new HttpRequestMessage(HttpMethod.Post, $"{_configService.ServerUrl}/api/webrtc/transport")
            {
                Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json")
            };

            if (!string.IsNullOrEmpty(_authService.AuthToken))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _authService.AuthToken);
            }

            var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            var transportData = JsonSerializer.Deserialize<JsonElement>(json);

            var transport = new MediaSoupTransport
            {
                Id = transportData.GetProperty("id").GetString() ?? string.Empty,
                IceParameters = transportData.GetProperty("iceParameters").Deserialize<object>() ?? new(),
                IceCandidates = transportData.GetProperty("iceCandidates").Deserialize<List<object>>() ?? new(),
                DtlsParameters = transportData.GetProperty("dtlsParameters").Deserialize<object>() ?? new(),
                SctpParameters = transportData.TryGetProperty("sctpParameters", out var sctp) ? sctp.Deserialize<object>() : null
            };

            _transports[transport.Id] = transport;
            _logger.LogInformation("MediaSoup transport created: {TransportId}", transport.Id);

            return transport;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create MediaSoup transport");
            Error?.Invoke(this, $"Failed to create transport: {ex.Message}");
            throw;
        }
    }

    public async Task ConnectTransportAsync(string transportId, object dtlsParameters)
    {
        if (!_transports.ContainsKey(transportId))
        {
            throw new ArgumentException($"Transport {transportId} not found");
        }

        try
        {
            _logger.LogInformation("Connecting MediaSoup transport: {TransportId}", transportId);

            var requestBody = new
            {
                transportId,
                dtlsParameters
            };

            var request = new HttpRequestMessage(HttpMethod.Post, $"{_configService.ServerUrl}/api/webrtc/transport/connect")
            {
                Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json")
            };

            if (!string.IsNullOrEmpty(_authService.AuthToken))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _authService.AuthToken);
            }

            var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();

            _isConnected = true;
            ConnectionStateChanged?.Invoke(this, true);
            _logger.LogInformation("MediaSoup transport connected: {TransportId}", transportId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to connect MediaSoup transport");
            Error?.Invoke(this, $"Failed to connect transport: {ex.Message}");
            throw;
        }
    }

    public async Task<MediaSoupProducer> ProduceAsync(string transportId, MediaStreamTrack track, string? groupId = null)
    {
        if (!_transports.ContainsKey(transportId))
        {
            throw new ArgumentException($"Transport {transportId} not found");
        }

        // TODO: Implement actual WebRTC producer using SIPSorcery
        // This is a placeholder that will need full WebRTC implementation
        _logger.LogWarning("ProduceAsync is not yet fully implemented - WebRTC producer creation requires full SIPSorcery integration");

        throw new NotImplementedException("WebRTC producer creation requires full SIPSorcery integration");
    }

    public async Task<MediaSoupConsumer> ConsumeAsync(string transportId, string producerId, string? groupId = null)
    {
        if (!_transports.ContainsKey(transportId))
        {
            throw new ArgumentException($"Transport {transportId} not found");
        }

        try
        {
            _logger.LogInformation("Creating MediaSoup consumer: TransportId={TransportId}, ProducerId={ProducerId}", transportId, producerId);

            var requestBody = new
            {
                transportId,
                producerId,
                rtpCapabilities = _rtpCapabilities,
                groupId = groupId ?? "global"
            };

            var request = new HttpRequestMessage(HttpMethod.Post, $"{_configService.ServerUrl}/api/webrtc/consume")
            {
                Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json")
            };

            if (!string.IsNullOrEmpty(_authService.AuthToken))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _authService.AuthToken);
            }

            var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            var consumerData = JsonSerializer.Deserialize<JsonElement>(json);

            var consumer = new MediaSoupConsumer
            {
                Id = consumerData.GetProperty("id").GetString() ?? string.Empty,
                ProducerId = consumerData.GetProperty("producerId").GetString() ?? string.Empty,
                Kind = consumerData.GetProperty("kind").GetString() ?? string.Empty,
                RtpParameters = consumerData.GetProperty("rtpParameters").Deserialize<object>() ?? new()
            };

            _consumers[consumer.Id] = consumer;
            _logger.LogInformation("MediaSoup consumer created: {ConsumerId}", consumer.Id);

            return consumer;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create MediaSoup consumer");
            Error?.Invoke(this, $"Failed to create consumer: {ex.Message}");
            throw;
        }
    }

    public async Task CloseTransportAsync(string transportId)
    {
        if (!_transports.ContainsKey(transportId))
        {
            return;
        }

        try
        {
            var request = new HttpRequestMessage(HttpMethod.Delete, $"{_configService.ServerUrl}/api/webrtc/transport/{transportId}");

            if (!string.IsNullOrEmpty(_authService.AuthToken))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _authService.AuthToken);
            }

            await _httpClient.SendAsync(request);
            _transports.Remove(transportId);
            _logger.LogInformation("MediaSoup transport closed: {TransportId}", transportId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to close MediaSoup transport");
        }
    }

    public async Task CloseProducerAsync(string producerId)
    {
        if (!_producers.ContainsKey(producerId))
        {
            return;
        }

        try
        {
            var request = new HttpRequestMessage(HttpMethod.Delete, $"{_configService.ServerUrl}/api/webrtc/producer/{producerId}");

            if (!string.IsNullOrEmpty(_authService.AuthToken))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _authService.AuthToken);
            }

            await _httpClient.SendAsync(request);
            _producers.Remove(producerId);
            _logger.LogInformation("MediaSoup producer closed: {ProducerId}", producerId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to close MediaSoup producer");
        }
    }

    public async Task CloseConsumerAsync(string consumerId)
    {
        if (!_consumers.ContainsKey(consumerId))
        {
            return;
        }

        try
        {
            var request = new HttpRequestMessage(HttpMethod.Delete, $"{_configService.ServerUrl}/api/webrtc/consumer/{consumerId}");

            if (!string.IsNullOrEmpty(_authService.AuthToken))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _authService.AuthToken);
            }

            await _httpClient.SendAsync(request);
            _consumers.Remove(consumerId);
            _logger.LogInformation("MediaSoup consumer closed: {ConsumerId}", consumerId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to close MediaSoup consumer");
        }
    }

    public async Task CleanupAsync()
    {
        _logger.LogInformation("Cleaning up MediaSoup service...");

        // Close all consumers
        foreach (var consumerId in _consumers.Keys.ToList())
        {
            await CloseConsumerAsync(consumerId);
        }

        // Close all producers
        foreach (var producerId in _producers.Keys.ToList())
        {
            await CloseProducerAsync(producerId);
        }

        // Close all transports
        foreach (var transportId in _transports.Keys.ToList())
        {
            await CloseTransportAsync(transportId);
        }

        _isConnected = false;
        _isInitialized = false;
        ConnectionStateChanged?.Invoke(this, false);
    }

    public void Dispose()
    {
        CleanupAsync().Wait(TimeSpan.FromSeconds(5));
    }
}

