using FreneticUtilities.FreneticToolkit;
using System.Collections.Concurrent;
using System.Text;

namespace SunnydaleLibrary.Utils;

/// <summary>Central internal logging handler. Ported from HartsyWeb.</summary>
public static class Logs
{
    public static LockObject ConsoleLock = new();

    public static string LogFilePath = string.Empty;

    public static ConcurrentQueue<string> LogsToSave = new();

    public static Thread LogSaveThread = null!;

    public static ManualResetEvent LogSaveCompletion = new(false);

    public static long LastLogTime = 0;

    public static TimeSpan RepeatTimestampAfter = TimeSpan.FromMinutes(10);

    public static void StartLogSaving()
    {
        bool isDocker = File.Exists("/.dockerenv");
        string basePath = isDocker ? "/app/logs" : "logs";
        Directory.CreateDirectory(basePath);
        DateTimeOffset time = DateTimeOffset.Now;
        string fileName = $"log_{time:yyyy-MM-dd_HH-mm}_{Environment.ProcessId}.txt";
        LogFilePath = Path.Combine(basePath, fileName);
        LogSaveThread = new(LogSaveInternalLoop) { Name = "logsaver" };
        LogSaveThread.Start();
    }

    public static void LogSaveInternalLoop()
    {
        while (!Program.GlobalProgramCancel.IsCancellationRequested)
        {
            SaveLogsToFileOnce();
            try
            {
                Task.Delay(TimeSpan.FromSeconds(25)).Wait(Program.GlobalProgramCancel);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
        LogSaveCompletion.Set();
    }

    public static void SaveLogsToFileOnce()
    {
        if (LogsToSave.IsEmpty)
        {
            return;
        }
        StringBuilder toStore = new();
        while (LogsToSave.TryDequeue(out string? line))
        {
            toStore.Append($"{line}\n");
        }
        if (toStore.Length > 0)
        {
            File.AppendAllText(LogFilePath, toStore.ToString());
            toStore.Clear();
        }
    }

    public enum LogLevel : int
    {
        Verbose, Debug, Info, Init, Warning, Error, None
    }

    public static LogLevel MinimumLevel = LogLevel.Info;

    public static void Verbose(string message)
    {
        LogWithColor(ConsoleColor.Black, ConsoleColor.Gray, "Verbose", ConsoleColor.Black, ConsoleColor.Gray, message, LogLevel.Verbose);
    }

    public static void Debug(string message)
    {
        LogWithColor(ConsoleColor.Black, ConsoleColor.Gray, "Debug", ConsoleColor.Black, ConsoleColor.Gray, message, LogLevel.Debug);
    }

    public static void Info(string message)
    {
        LogWithColor(ConsoleColor.Black, ConsoleColor.Cyan, "Info", ConsoleColor.Black, ConsoleColor.White, message, LogLevel.Info);
    }

    public static void Init(string message)
    {
        LogWithColor(ConsoleColor.Black, ConsoleColor.Green, "Init", ConsoleColor.Black, ConsoleColor.Gray, message, LogLevel.Init);
    }

    public static void Warning(string message)
    {
        LogWithColor(ConsoleColor.Black, ConsoleColor.Yellow, "Warning", ConsoleColor.Black, ConsoleColor.Yellow, message, LogLevel.Warning);
    }

    public static void Error(string message)
    {
        LogWithColor(ConsoleColor.Black, ConsoleColor.Red, "Error", ConsoleColor.Black, ConsoleColor.Red, message, LogLevel.Error);
    }

    public class LogTracker
    {
        public static int MaxTracked = 512;

        public Queue<LogMessage> Messages = new(MaxTracked);

        public string Color = "#707070";

        public static long LastSequenceID = 0;

        public LockObject Lock = new();

        public long LastSeq = 0;

        public string Identifier = "";

        public void Track(string message)
        {
            lock (Lock)
            {
                long seq = Interlocked.Increment(ref LastSequenceID);
                Messages.Enqueue(new LogMessage(DateTimeOffset.Now, message, seq));
                LastSeq = seq;
                if (Messages.Count > MaxTracked)
                {
                    Messages.Dequeue();
                }
            }
        }
    }

    public record struct LogMessage(DateTimeOffset Time, string Message, long Sequence);

    public static LogTracker[] Trackers = new LogTracker[(int)LogLevel.None];

    public static Dictionary<string, LogTracker> OtherTrackers = [];

    static Logs()
    {
        Trackers[(int)LogLevel.Verbose] = new() { Color = "#606060" };
        Trackers[(int)LogLevel.Debug] = new() { Color = "#808080" };
        Trackers[(int)LogLevel.Info] = new() { Color = "#00FFFF" };
        Trackers[(int)LogLevel.Init] = new() { Color = "#00FF00" };
        Trackers[(int)LogLevel.Warning] = new() { Color = "#FFFF00" };
        Trackers[(int)LogLevel.Error] = new() { Color = "#FF0000" };
        for (int i = 0; i < (int)LogLevel.None; i++)
        {
            OtherTrackers[$"{(LogLevel)i}"] = Trackers[i];
        }
    }

    public static void LogWithColor(ConsoleColor prefixBackground, ConsoleColor prefixForeground, string prefix, ConsoleColor messageBackground, ConsoleColor messageForeground, string message, LogLevel level)
    {
        lock (ConsoleLock)
        {
            Trackers[(int)level].Track(message);
            if (MinimumLevel > level)
            {
                return;
            }
            Console.BackgroundColor = ConsoleColor.Black;
            DateTimeOffset timestamp = DateTimeOffset.Now;
            if (Environment.TickCount64 - LastLogTime > RepeatTimestampAfter.TotalMilliseconds && LastLogTime != 0)
            {
                Console.ForegroundColor = ConsoleColor.Cyan;
                Console.WriteLine($"== Sunnydale Library logs {timestamp:yyyy-MM-dd HH:mm} ==");
            }
            LastLogTime = Environment.TickCount64;
            string time = $"{timestamp:HH:mm:ss.fff}";
            Console.ForegroundColor = ConsoleColor.Gray;
            Console.Write($"{time} [");
            Console.BackgroundColor = prefixBackground;
            Console.ForegroundColor = prefixForeground;
            Console.Write(prefix);
            Console.BackgroundColor = ConsoleColor.Black;
            Console.ForegroundColor = ConsoleColor.Gray;
            Console.Write("] ");
            Console.BackgroundColor = messageBackground;
            Console.ForegroundColor = messageForeground;
            Console.WriteLine(message);
            Console.BackgroundColor = ConsoleColor.Black;
            Console.ForegroundColor = ConsoleColor.White;
            LogsToSave?.Enqueue($"{time} [{prefix}] {message}");
        }
    }
}
