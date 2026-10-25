package kz.degirmen.guard;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Экран настройки: привязка по коду из админки Degirmen и выдача разрешений. Дальше всё работает само. */
public class MainActivity extends Activity {
    static final int BG = Color.parseColor("#1A130F"), CARD = Color.parseColor("#2A1F18"), INK = Color.parseColor("#F4E9DF"),
            MUTE = Color.parseColor("#B9A79A"), ACC = Color.parseColor("#B8432C"), OK = Color.parseColor("#7FD08E"), WARN = Color.parseColor("#FFB347");
    private LinearLayout root;
    private final Handler h = new Handler(Looper.getMainLooper());
    private TextView status, steps;
    private EditText code;
    private Button pairBtn;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(BG);
        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(BG);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int p = dp(20);
        root.setPadding(p, dp(28), p, p);
        sv.addView(root);
        setContentView(sv);

        TextView t = text("Degirmen Защита", 26, INK, true);
        root.addView(t);
        root.addView(text("Планшет постоянно сообщает своё место в Degirmen. Если его унесут с точки или выключат, вам придёт тревога в Telegram.", 14, MUTE, false));
        space(16);

        status = text("", 15, INK, true);
        LinearLayout sc = card(); sc.addView(status); root.addView(sc);
        space(14);

        root.addView(text("1. Привязка", 17, INK, true));
        root.addView(text("В приложении Degirmen: Админка → Где планшеты → «Добавить планшет». Введите 6 цифр оттуда.", 13, MUTE, false));
        code = new EditText(this);
        code.setInputType(InputType.TYPE_CLASS_NUMBER);
        code.setHint("Код из админки");
        code.setTextColor(INK); code.setHintTextColor(MUTE); code.setTextSize(22);
        code.setLetterSpacing(0.2f);
        root.addView(code);
        pairBtn = button("Привязать", v -> pair());
        root.addView(pairBtn);
        space(14);

        root.addView(text("2. Разрешения (нажмите каждую кнопку)", 17, INK, true));
        root.addView(button("Местоположение", v -> askLocation()));
        root.addView(button("Местоположение «Всегда»", v -> askBackground()));
        root.addView(button("Батарея без ограничений", v -> askBattery()));
        root.addView(button("Автозапуск и настройки приложения", v -> openAppSettings()));
        steps = text("", 13, MUTE, false);
        root.addView(steps);
        space(14);
        root.addView(text("На Samsung: Настройки → Батарея → Ограничения фона → «Никогда не переводить в режим сна» → добавить «Degirmen Защита». На Xiaomi: включить «Автозапуск».", 12, MUTE, false));
        space(10);
        root.addView(text("Также включите «Найти устройство» от Google: он работает, даже если это приложение закрыто.", 12, MUTE, false));
        h.post(tick);
    }

    @Override protected void onResume() {
        super.onResume();
        if (Api.paired(this) && hasLocation() && !TrackService.running) TrackService.start(this);
    }

    private final Runnable tick = new Runnable() { @Override public void run() { refresh(); h.postDelayed(this, 2000); } };

    private void refresh() {
        SharedPreferences sp = Api.prefs(this);
        boolean paired = Api.paired(this);
        StringBuilder s = new StringBuilder();
        if (!paired) { s.append("Не привязан. Введите код из админки."); status.setTextColor(WARN); }
        else {
            s.append("Привязан как «").append(sp.getString("name", "Планшет")).append("»\n");
            s.append(TrackService.running ? "Защита работает" : "Защита остановлена - выдайте разрешения");
            long at = sp.getLong("last_at", 0);
            if (at > 0) {
                s.append("\nПоследняя отправка: ").append(new SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(new Date(at)))
                        .append(" · ").append("ok".equals(sp.getString("last_res", "")) ? "доставлено" : sp.getString("last_res", ""));
                s.append("\n").append(sp.getString("last_pos", ""));
            }
            status.setTextColor(TrackService.running ? OK : WARN);
        }
        status.setText(s.toString());
        code.setVisibility(paired ? View.GONE : View.VISIBLE);
        pairBtn.setVisibility(paired ? View.GONE : View.VISIBLE);
        StringBuilder st = new StringBuilder();
        st.append(hasLocation() ? "✓ местоположение\n" : "✗ местоположение\n");
        if (Build.VERSION.SDK_INT >= 29) st.append(granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION) ? "✓ «Всегда»\n" : "✗ «Всегда»\n");
        if (Build.VERSION.SDK_INT >= 23) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            st.append(pm.isIgnoringBatteryOptimizations(getPackageName()) ? "✓ батарея без ограничений" : "✗ батарея без ограничений");
        }
        steps.setText(st.toString());
    }

    private void pair() {
        final String c = code.getText().toString().trim();
        if (c.length() != 6) { toast("Нужно 6 цифр"); return; }
        pairBtn.setEnabled(false);
        new Thread(() -> {
            String msg;
            try {
                JSONObject r = new JSONObject(Api.post("device_pair", new JSONObject().put("p_code", c)));
                if (r.has("token")) {
                    Api.prefs(this).edit().putString("token", r.getString("token")).putString("name", r.optString("name", "Планшет")).apply();
                    msg = "Привязано! Теперь выдайте разрешения.";
                } else msg = "locked".equals(r.optString("error")) ? "Слишком много попыток, подождите 10 минут" : "Неверный или устаревший код";
            } catch (Exception e) { msg = "Нет связи с сервером"; }
            final String m = msg;
            h.post(() -> {
                pairBtn.setEnabled(true); toast(m); refresh();
                if (Api.paired(this)) { if (hasLocation()) TrackService.start(this); else askLocation(); }
            });
        }).start();
    }

    private boolean granted(String p) { return Build.VERSION.SDK_INT < 23 || checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }
    private boolean hasLocation() { return granted(Manifest.permission.ACCESS_FINE_LOCATION) || granted(Manifest.permission.ACCESS_COARSE_LOCATION); }

    private void askLocation() {
        if (Build.VERSION.SDK_INT < 23) return;
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.POST_NOTIFICATIONS}, 1);
        else requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, 1);
    }
    private void askBackground() {
        if (!hasLocation()) { askLocation(); toast("Сначала обычное местоположение"); return; }
        if (Build.VERSION.SDK_INT >= 29) {
            toast("Выберите «Разрешить в любом режиме»");
            requestPermissions(new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION}, 2);
        }
    }
    private void askBattery() {
        if (Build.VERSION.SDK_INT < 23) return;
        try { startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName()))); }
        catch (Exception e) { openAppSettings(); }
    }
    private void openAppSettings() {
        startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
    }

    @Override public void onRequestPermissionsResult(int rc, String[] p, int[] g) {
        super.onRequestPermissionsResult(rc, p, g);
        if (Api.paired(this) && hasLocation()) TrackService.start(this);
        if (rc == 2 && Build.VERSION.SDK_INT >= 29 && !granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION)) openAppSettings();
        refresh();
    }

    // --- простая разметка без XML ---
    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
    private void space(int v) { View s = new View(this); s.setLayoutParams(new LinearLayout.LayoutParams(1, dp(v))); root.addView(s); }
    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this); t.setText(s); t.setTextSize(sp); t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(0, dp(4), 0, dp(4)); t.setLineSpacing(0, 1.15f); return t;
    }
    private LinearLayout card() {
        LinearLayout l = new LinearLayout(this); l.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable g = new GradientDrawable(); g.setColor(CARD); g.setCornerRadius(dp(18)); l.setBackground(g);
        l.setPadding(dp(16), dp(14), dp(16), dp(14)); return l;
    }
    private Button button(String s, View.OnClickListener l) {
        Button b = new Button(this); b.setText(s); b.setAllCaps(false); b.setTextColor(Color.WHITE); b.setTextSize(15);
        GradientDrawable g = new GradientDrawable(); g.setColor(ACC); g.setCornerRadius(dp(26)); b.setBackground(g);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(52));
        lp.topMargin = dp(8); b.setLayoutParams(lp); b.setGravity(Gravity.CENTER); b.setOnClickListener(l); return b;
    }
    private void toast(String m) { android.widget.Toast.makeText(this, m, android.widget.Toast.LENGTH_LONG).show(); }
}
