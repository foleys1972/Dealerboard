using System.Net.Http;
using System.Reflection;
using SocketIOClient;
using SocketIOClient.Transport;
using SocketIOClient.Transport.Http;
using SocketIOClient.Transport.WebSockets;

var url = args.Length > 0 ? args[0] : "https://localhost:5000";

static IHttpClient CreateDevHttpClient()
{
    var http = new DefaultHttpClient();
    var handlerField = typeof(DefaultHttpClient).GetField("_handler", BindingFlags.NonPublic | BindingFlags.Instance);
    if (handlerField?.GetValue(http) is HttpClientHandler handler)
    {
        handler.ServerCertificateCustomValidationCallback = (_, _, _, _) => true;
    }
    return http;
}

static IClientWebSocket CreateDevWebSocket()
{
    var ws = new DefaultClientWebSocket();
    var wsField = typeof(DefaultClientWebSocket).GetField("_ws", BindingFlags.NonPublic | BindingFlags.Instance);
    if (wsField?.GetValue(ws) is System.Net.WebSockets.ClientWebSocket inner)
    {
        inner.Options.RemoteCertificateValidationCallback = (_, _, _, _) => true;
    }
    return ws;
}

async Task Test(string name, Action<SocketIOOptions> configure)
{
    var options = new SocketIOOptions
    {
        Path = "/socket.io",
        Reconnection = false,
        ConnectionTimeout = TimeSpan.FromSeconds(10),
    };
    configure(options);

    var client = new SocketIOClient.SocketIO(url, options);
    client.HttpClient = CreateDevHttpClient();
    client.ClientWebSocketProvider = CreateDevWebSocket;

    var sw = System.Diagnostics.Stopwatch.StartNew();
    try
    {
        var connectTask = client.ConnectAsync();
        var done = await Task.WhenAny(connectTask, Task.Delay(15000));
        if (done != connectTask)
        {
            Console.WriteLine($"{name,-30} -> HANG (no connect after 15s)");
        }
        else
        {
            await connectTask;
            Console.WriteLine($"{name,-30} -> connected={client.Connected} id={client.Id} ({sw.ElapsedMilliseconds}ms)");
        }
    }
    catch (Exception ex)
    {
        var inner = ex.InnerException != null ? $" | inner: {ex.InnerException.Message}" : "";
        Console.WriteLine($"{name,-30} -> ERROR: {ex.GetType().Name}: {ex.Message}{inner} ({sw.ElapsedMilliseconds}ms)");
    }
    finally
    {
        try { client.Dispose(); } catch { }
    }
}

Console.WriteLine($"Testing SocketIOClient.NET 3.1.1 against {url} (cert bypass via transport seams)\n");
await Test("polling, no upgrade", o => { o.Transport = TransportProtocol.Polling; o.AutoUpgrade = false; });
await Test("websocket direct", o => { o.Transport = TransportProtocol.WebSocket; });
await Test("polling + AutoUpgrade", o => { o.Transport = TransportProtocol.Polling; o.AutoUpgrade = true; });
