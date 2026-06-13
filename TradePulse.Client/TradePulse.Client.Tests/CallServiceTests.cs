using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using TradePulse.Client.Core.Models;
using TradePulse.Client.Core.Services;
using Xunit;

namespace TradePulse.Client.Tests;

public class CallServiceTests
{
    private readonly Mock<ISocketService> _socket = new();
    private readonly Mock<IAudioService> _audio = new();
    private readonly Mock<IAudioStreamingService> _audioStreaming = new();
    private readonly Mock<IMediaSoupService> _mediaSoup = new();
    private readonly Mock<IBroadcastRtpBridgeService> _rtpBridge = new();
    private readonly Mock<IWebMediaEngineService> _webEngine = new();
    private readonly Mock<ICallRecordingService> _recording = new();
    private readonly Mock<IAuthService> _auth = new();

    private CallService CreateService()
    {
        _mediaSoup.SetupGet(m => m.IsInitialized).Returns(true);
        _auth.SetupGet(a => a.CurrentUser).Returns(new User { Id = "user-1", Username = "trader1" });

        return new CallService(
            NullLogger<CallService>.Instance,
            _socket.Object,
            _audio.Object,
            _audioStreaming.Object,
            _mediaSoup.Object,
            _rtpBridge.Object,
            _webEngine.Object,
            _recording.Object,
            _auth.Object);
    }

    private static async Task WaitUntilAsync(Func<bool> condition, int timeoutMs = 5000)
    {
        var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        while (!condition() && DateTime.UtcNow < deadline)
        {
            await Task.Delay(25);
        }

        Assert.True(condition(), "Condition not met within timeout");
    }

    [Fact]
    public async Task StartCallAsync_SecondConcurrentStart_ThrowsWhenConnected()
    {
        var service = CreateService();

        await service.StartCallAsync("trader2", CallType.Direct);

        // Simulate the server connecting the call.
        _socket.Raise(s => s.CallStateChanged += null, _socket.Object, new Call
        {
            Id = "instant-123",
            Type = CallType.Direct,
            State = CallState.Connected
        });

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => service.StartCallAsync("trader3", CallType.Direct));
    }

    [Fact]
    public async Task StartCallAsync_FailedEmit_ReleasesCallSlot()
    {
        _socket.Setup(s => s.EmitCallAsync(It.IsAny<string>(), It.IsAny<CallType>(), It.IsAny<bool>()))
            .ThrowsAsync(new InvalidOperationException("socket down"));

        var service = CreateService();

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => service.StartCallAsync("trader2", CallType.Direct));

        Assert.Null(service.CurrentCall);
    }

    [Fact]
    public async Task WebRtcSetup_VoiceDirectCall_UsesNativeRtpBridge_NotWebEngine()
    {
        var service = CreateService();
        await service.StartCallAsync("trader2", CallType.Direct);

        _socket.Raise(s => s.WebRTCSetupRequired += null, _socket.Object, new WebRTCSetupData
        {
            CallId = "instant-abc",
            Participants = new List<string> { "user-1", "trader2" }
        });

        await WaitUntilAsync(() =>
            _rtpBridge.Invocations.Any(i => i.Method.Name == nameof(IBroadcastRtpBridgeService.StartTransmitAsync)));

        _rtpBridge.Verify(b => b.StartTransmitAsync("instant-abc", It.IsAny<CancellationToken>()), Times.Once);
        _webEngine.Verify(w => w.StartCallAsync(It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task WebRtcSetup_VideoDirectCall_UsesWebEngine_NotNativeBridge()
    {
        var service = CreateService();
        await service.StartCallAsync("trader2", CallType.Direct, enableVideo: true);

        _socket.Raise(s => s.WebRTCSetupRequired += null, _socket.Object, new WebRTCSetupData
        {
            CallId = "instant-video",
            Participants = new List<string> { "user-1", "trader2" }
        });

        await WaitUntilAsync(() =>
            _webEngine.Invocations.Any(i => i.Method.Name == nameof(IWebMediaEngineService.StartCallAsync)));

        _webEngine.Verify(w => w.StartCallAsync("instant-video", true, It.IsAny<CancellationToken>()), Times.Once);
        _rtpBridge.Verify(b => b.StartTransmitAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task WebRtcSetup_NativeBridgeFails_FallsBackToWebEngine()
    {
        _rtpBridge.Setup(b => b.StartTransmitAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("no UDP path"));

        var service = CreateService();
        await service.StartCallAsync("trader2", CallType.Direct);

        _socket.Raise(s => s.WebRTCSetupRequired += null, _socket.Object, new WebRTCSetupData
        {
            CallId = "instant-fallback",
            Participants = new List<string> { "user-1", "trader2" }
        });

        await WaitUntilAsync(() =>
            _webEngine.Invocations.Any(i => i.Method.Name == nameof(IWebMediaEngineService.StartCallAsync)));

        _webEngine.Verify(w => w.StartCallAsync("instant-fallback", false, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CallEnded_AfterNativeVoiceCall_StopsNativeBridge()
    {
        var service = CreateService();
        await service.StartCallAsync("trader2", CallType.Direct);

        _socket.Raise(s => s.WebRTCSetupRequired += null, _socket.Object, new WebRTCSetupData
        {
            CallId = "instant-end",
            Participants = new List<string> { "user-1", "trader2" }
        });

        await WaitUntilAsync(() =>
            _rtpBridge.Invocations.Any(i => i.Method.Name == nameof(IBroadcastRtpBridgeService.StartTransmitAsync)));

        _socket.Raise(s => s.CallEnded += null, _socket.Object, "instant-end");

        await WaitUntilAsync(() =>
            _rtpBridge.Invocations.Any(i =>
                i.Method.Name == nameof(IBroadcastRtpBridgeService.StopAsync)
                && Equals(i.Arguments[0], "instant-end")));

        _rtpBridge.Verify(b => b.StopAsync("instant-end", It.IsAny<CancellationToken>()), Times.Once);
        Assert.Null(service.CurrentCall);
    }
}
