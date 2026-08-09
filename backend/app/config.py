from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- MySQL ---
    MYSQL_HOST: str
    MYSQL_PORT: int = 3306
    MYSQL_USER: str
    MYSQL_PASSWORD: str
    MYSQL_DATABASE: str
    MYSQL_SSL: bool = False

    # --- Emoera OIDC 通行证 (lotus-passport) ---
    # 本地服务示例: http://localhost:8000/api/v1
    # 生产服务:     https://accountapi.emoera.com/api
    # 拿到 client_id / client_secret 后把 PASSPORT_ENABLED 置为 true 即可启用
    PASSPORT_ENABLED: bool = False
    OIDC_ISSUER: str = "https://accountapi.emoera.com/api"
    OIDC_JWKS_URL: str = ""   # 缺省 = {OIDC_ISSUER}/.well-known/jwks.json
    OIDC_USERINFO_URL: str = ""  # 缺省 = {OIDC_ISSUER}/userinfo/
    OIDC_PROVIDER: str = "github"  # 授权登录用的 provider 名（依通行证服务支持而定）
    OIDC_CLIENT_ID: str = ""
    OIDC_CLIENT_SECRET: str = ""
    OIDC_REDIRECT_URI: str = "http://localhost:3001/callback"
    OIDC_SCOPE: str = "openid profile email"


settings = Settings()
