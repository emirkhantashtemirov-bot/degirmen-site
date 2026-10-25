package kz.degirmen.guard;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Постоянная служба: держит GPS и сеть, раз в 30 секунд (и сразу при движении) отправляет место планшета.
 * Работает с видимым уведомлением - так требует Android, и так честно: персонал видит, что защита включена.
 */
public class TrackService extends Service implements LocationListener {
    static final String CH = "guard";
    static final int NID = 7;
    static final long BEAT_MS = 30_000;
    static volatile boolean running = false;

    private LocationManager lm;
    private final Handler h = new Handler(Looper.getMainLooper());
    private final ExecutorService net = Executors.newSingleThreadExecutor();
    private PowerManager.WakeLock wl;
    private Location best;
    private long lastSent = 0;
    private Location lastSentLoc;

    static void start(Context c) {
        Intent i = new Intent(c, TrackService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null) {
            NotificationChannel ch = new NotificationChannel(CH, "Защита планшета", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Notification n = notif("Защита включена · место отправляется в Degirmen");
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(NID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(NID, n);
        } catch (Exception e) { // нет разрешения на геолокацию - работаем как «пульс» без координат
            try { startForeground(NID, n); } catch (Exception ignored) { stopSelf(); return; }
        }
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "degirmen:guard");
        wl.setReferenceCounted(false);
        wl.acquire();
        lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        requestUpdates();
        running = true;
        h.post(beat);
    }

    private Notification notif(String text) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH) : new Notification.Builder(this);
        return b.setContentTitle("Degirmen Защита").setContentText(text).setSmallIcon(R.drawable.ic_launcher)
                .setOngoing(true).setContentIntent(pi).build();
    }

    private void requestUpdates() {
        try {
            for (String p : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
                if (lm.getAllProviders().contains(p)) {
                    lm.requestLocationUpdates(p, 10_000, 0, this, Looper.getMainLooper());
                    Location l = lm.getLastKnownLocation(p);
                    if (l != null) consider(l);
                }
            }
        } catch (SecurityException ignored) { }
    }

    private void consider(Location l) {
        if (best == null) { best = l; return; }
        boolean newer = l.getTime() > best.getTime() + 20_000;
        boolean moreAccurate = l.getAccuracy() <= best.getAccuracy() + 10;
        if (newer || moreAccurate) best = l;
    }

    @Override public void onLocationChanged(Location l) {
        consider(l);
        long now = System.currentTimeMillis();
        // сдвинулся больше чем на 25 м - отправляем сразу, не ждём пульса
        if (lastSentLoc != null && best != null && best.distanceTo(lastSentLoc) > 25 && now - lastSent > 8_000) send();
    }
    @Override public void onProviderEnabled(String p) { }
    @Override public void onProviderDisabled(String p) { }
    @Override @Deprecated public void onStatusChanged(String p, int s, Bundle b) { }

    private final Runnable beat = new Runnable() {
        @Override public void run() {
            send();
            h.postDelayed(this, BEAT_MS);
        }
    };

    private void send() {
        final SharedPreferences sp = Api.prefs(this);
        final String token = sp.getString("token", null);
        if (token == null) { stopSelf(); return; }
        final Location l = best;
        lastSent = System.currentTimeMillis();
        lastSentLoc = l;
        final int batt = battery();
        final boolean charging = charging();
        final String netType = netType();
        net.execute(() -> {
            String res;
            try {
                JSONObject b = new JSONObject();
                b.put("p_token", token);
                if (l != null) { b.put("p_lat", l.getLatitude()); b.put("p_lng", l.getLongitude()); b.put("p_acc", (double) l.getAccuracy()); }
                else { b.put("p_lat", JSONObject.NULL); b.put("p_lng", JSONObject.NULL); b.put("p_acc", JSONObject.NULL); }
                b.put("p_batt", batt);
                b.put("p_charging", charging);
                b.put("p_net", netType);
                res = Api.post("device_ping", b).replace("\"", "").trim();
            } catch (Exception e) { res = "нет связи"; }
            final String r = res;
            sp.edit().putLong("last_at", System.currentTimeMillis()).putString("last_res", r)
                    .putString("last_pos", l == null ? "место ещё не определено" : String.format(java.util.Locale.US, "%.5f, %.5f · ±%d м", l.getLatitude(), l.getLongitude(), Math.round(l.getAccuracy()))).apply();
            if ("unknown".equals(r)) { // планшет отвязали в админке
                sp.edit().remove("token").apply();
                h.post(this::stopSelf);
            }
        });
    }

    private int battery() {
        try {
            Intent b = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            int lvl = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1), sc = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
            return lvl < 0 ? -1 : Math.round(lvl * 100f / sc);
        } catch (Exception e) { return -1; }
    }
    private boolean charging() {
        try {
            Intent b = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            return b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0;
        } catch (Exception e) { return false; }
    }
    private String netType() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (Build.VERSION.SDK_INT >= 23) {
                NetworkCapabilities nc = cm.getNetworkCapabilities(cm.getActiveNetwork());
                if (nc == null) return "нет сети";
                if (nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return "Wi-Fi";
                if (nc.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return "мобильная";
                return "другая";
            }
        } catch (Exception ignored) { }
        return "?";
    }

    @Override public int onStartCommand(Intent i, int f, int id) { return START_STICKY; }

    @Override public void onTaskRemoved(Intent root) { // смахнули из недавних - поднимаемся снова
        super.onTaskRemoved(root);
        try { start(getApplicationContext()); } catch (Exception ignored) { }
    }

    @Override public void onDestroy() {
        running = false;
        h.removeCallbacksAndMessages(null);
        try { lm.removeUpdates(this); } catch (Exception ignored) { }
        try { if (wl != null && wl.isHeld()) wl.release(); } catch (Exception ignored) { }
        net.shutdown();
        super.onDestroy();
    }
}
