package kz.degirmen.guard;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Связь с базой Degirmen: привязка планшета и отправка координат. Ключ публичный (как в приложении), секрет - только токен планшета. */
final class Api {
    static final String BASE = "https://nctmbakzbzzkygndaklr.supabase.co/rest/v1/rpc/";
    static final String KEY = "sb_publishable_xnG4ep1p9DtCe3x1HxMwdg_Gvq_YfUN";

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("guard", Context.MODE_PRIVATE); }
    static boolean paired(Context c) { return prefs(c).getString("token", null) != null; }

    static String post(String fn, JSONObject body) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(BASE + fn).openConnection();
        h.setConnectTimeout(15000);
        h.setReadTimeout(20000);
        h.setRequestMethod("POST");
        h.setDoOutput(true);
        h.setRequestProperty("apikey", KEY);
        h.setRequestProperty("Content-Type", "application/json");
        try (OutputStream o = h.getOutputStream()) { o.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
        int code = h.getResponseCode();
        InputStream in = code >= 400 ? h.getErrorStream() : h.getInputStream();
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        if (in != null) { byte[] buf = new byte[4096]; int n; while ((n = in.read(buf)) > 0) b.write(buf, 0, n); in.close(); }
        h.disconnect();
        String s = b.toString("UTF-8");
        if (code >= 400) throw new Exception("HTTP " + code + " " + s);
        return s;
    }
}
