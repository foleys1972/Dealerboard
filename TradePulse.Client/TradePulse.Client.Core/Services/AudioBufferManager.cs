using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace TradePulse.Client.Core.Services;

/// <summary>
/// Manages audio buffers to prevent overflow and ensure smooth playback
/// </summary>
public class AudioBufferManager : IDisposable
{
    private readonly ILogger<AudioBufferManager> _logger;
    private readonly ConcurrentQueue<byte[]> _audioQueue = new();
    private readonly int _maxBufferSize;
    private readonly int _targetBufferSize;
    private bool _disposed = false;

    public AudioBufferManager(ILogger<AudioBufferManager> logger, int maxBufferSize = 100, int targetBufferSize = 20)
    {
        _logger = logger;
        _maxBufferSize = maxBufferSize;
        _targetBufferSize = targetBufferSize;
    }

    public void AddAudioData(byte[] audioData)
    {
        if (_disposed)
        {
            return;
        }

        // Prevent buffer overflow
        if (_audioQueue.Count >= _maxBufferSize)
        {
            // Drop oldest audio data
            if (_audioQueue.TryDequeue(out _))
            {
                _logger.LogWarning("Audio buffer overflow, dropping oldest frame");
            }
        }

        _audioQueue.Enqueue(audioData);
    }

    public bool TryGetAudioData(out byte[]? audioData)
    {
        audioData = null;
        
        if (_disposed)
        {
            return false;
        }

        return _audioQueue.TryDequeue(out audioData);
    }

    public int BufferCount => _audioQueue.Count;

    public bool IsBufferHealthy => _audioQueue.Count >= _targetBufferSize && _audioQueue.Count <= _maxBufferSize;

    public void Clear()
    {
        while (_audioQueue.TryDequeue(out _)) { }
        _logger.LogInformation("Audio buffer cleared");
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            Clear();
            _disposed = true;
        }
    }
}

