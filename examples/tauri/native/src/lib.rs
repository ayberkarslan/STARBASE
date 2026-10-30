use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    time::{timeout, Duration},
};
use url::Url;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Tokens {
    access_token: String,
    refresh_token: String,
}
static SESSION_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
pub struct Starbase {
    base: Url,
    client_id: String,
    http: reqwest::Client,
}
impl Starbase {
    pub fn new(base: &str, client_id: &str) -> Result<Self, String> {
        let base = Url::parse(base).map_err(|_| "invalid base URL")?;
        if base.scheme() != "https" && base.host_str() != Some("127.0.0.1") {
            return Err("HTTPS required".into());
        }
        Ok(Self {
            base,
            client_id: client_id.into(),
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(20))
                .build()
                .map_err(|_| "HTTP initialization failed")?,
        })
    }
    fn vault(&self) -> Result<keyring::Entry, String> {
        keyring::Entry::new("starbase", &format!("{}:{}", self.base, self.client_id))
            .map_err(|_| "credential store unavailable".into())
    }
    async fn post(&self, path: &str, body: serde_json::Value) -> Result<Tokens, String> {
        let response = self
            .http
            .post(self.base.join(path).map_err(|_| "invalid URL")?)
            .json(&body)
            .send()
            .await
            .map_err(|_| "STARBASE unavailable")?;
        if !response.status().is_success() {
            return Err("authentication rejected".into());
        }
        response.json().await.map_err(|_| "invalid response".into())
    }
    pub async fn login(
        &self,
        open: impl FnOnce(String) -> Result<(), String>,
    ) -> Result<serde_json::Value, String> {
        let _guard = SESSION_LOCK.lock().await;
        let listener = TcpListener::bind("127.0.0.1:43817")
            .await
            .map_err(|_| "callback port unavailable")?;
        let verifier = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        let state = uuid::Uuid::new_v4().to_string();
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let redirect = "http://127.0.0.1:43817/callback";
        let mut url = self.base.join("/authorize").map_err(|_| "invalid URL")?;
        url.query_pairs_mut().extend_pairs([
            ("client_id", self.client_id.as_str()),
            ("redirect_uri", redirect),
            ("code_challenge", challenge.as_str()),
            ("state", state.as_str()),
            ("scope", "profile organization"),
        ]);
        open(url.to_string())?;
        let (mut stream, _) = timeout(Duration::from_secs(120), listener.accept())
            .await
            .map_err(|_| "login timed out")?
            .map_err(|_| "callback failed")?;
        let mut bytes = [0u8; 8192];
        let n = timeout(Duration::from_secs(5), stream.read(&mut bytes))
            .await
            .map_err(|_| "callback timed out")?
            .map_err(|_| "callback failed")?;
        let request = std::str::from_utf8(&bytes[..n]).map_err(|_| "invalid callback")?;
        let first = request.lines().next().ok_or("invalid callback")?;
        let mut parts = first.split_whitespace();
        if parts.next() != Some("GET") {
            return Err("invalid callback method".into());
        }
        let callback = Url::parse(&format!(
            "http://127.0.0.1{}",
            parts.next().ok_or("invalid callback")?
        ))
        .map_err(|_| "invalid callback")?;
        let values: std::collections::HashMap<_, _> = callback.query_pairs().into_owned().collect();
        if callback.path() != "/callback" || values.get("state") != Some(&state) {
            return Err("callback state mismatch".into());
        }
        let code = values.get("code").ok_or("missing code")?;
        let tokens=self.post("/api/v1/auth/exchange",serde_json::json!({"code":code,"verifier":verifier,"clientId":self.client_id,"redirectUri":redirect})).await?;
        self.vault()?
            .set_password(&tokens.refresh_token)
            .map_err(|_| "credential storage failed")?;
        stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\nSTARBASE: Giris tamamlandi. Uygulamaya donebilirsin.").await.map_err(|_|"callback response failed")?;
        self.profile(&tokens.access_token).await
    }
    async fn profile(&self, token: &str) -> Result<serde_json::Value, String> {
        let r = self
            .http
            .get(self.base.join("/api/v1/me").map_err(|_| "invalid URL")?)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|_| "STARBASE unavailable")?;
        if !r.status().is_success() {
            return Err("session rejected".into());
        }
        r.json().await.map_err(|_| "invalid profile".into())
    }
    pub async fn get_profile(&self) -> Result<serde_json::Value, String> {
        let _guard = SESSION_LOCK.lock().await;
        let refresh = self.vault()?.get_password().map_err(|_| "login required")?;
        let tokens = self
            .post(
                "/api/v1/auth/refresh",
                serde_json::json!({"refreshToken":refresh,"clientId":self.client_id}),
            )
            .await?;
        self.vault()?
            .set_password(&tokens.refresh_token)
            .map_err(|_| "credential storage failed")?;
        self.profile(&tokens.access_token).await
    }
    /// Report an explicit sign-out before clearing the OS credential store.
    pub async fn logout(&self) -> Result<(), String> {
        let _guard = SESSION_LOCK.lock().await;
        let refresh = self.vault()?.get_password().map_err(|_| "login required")?;
        let tokens = self
            .post(
                "/api/v1/auth/refresh",
                serde_json::json!({"refreshToken":refresh,"clientId":self.client_id}),
            )
            .await?;
        self.vault()?
            .set_password(&tokens.refresh_token)
            .map_err(|_| "credential storage failed")?;
        let response = self
            .http
            .post(
                self.base
                    .join("/api/v1/auth/logout")
                    .map_err(|_| "invalid URL")?,
            )
            .bearer_auth(&tokens.access_token)
            .json(&serde_json::json!({}))
            .send()
            .await
            .map_err(|_| "sign-out could not be reported; retry when connected")?;
        if !response.status().is_success() {
            return Err("sign-out rejected".into());
        }
        self.clear_local_session()
    }
    pub fn clear_local_session(&self) -> Result<(), String> {
        self.vault()?
            .delete_credential()
            .map_err(|_| "credential deletion failed".into())
    }
}
