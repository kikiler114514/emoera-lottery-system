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

    # --- Session ---
    SESSION_SECRET: str = "dev-secret-change-in-production"
    SESSION_MAX_AGE: int = 86400 * 7  # 7 天

    # --- 限额 ---
    MAX_ROOMS_PER_USER: int = 2
    MAX_ACTIVITIES_PER_USER: int = 2
    MAX_ROOMS_PER_ACTIVITY: int = 10
    MAX_NONLOGIN_PARTICIPANTS: int = 1  # 未登录用户最多报名人数
    ROOM_EXPIRE_DAYS: int = 3  # 长时间未使用自动删除

    # --- Emoera OIDC 通行证 (lotus-passport) ---
    # 本地服务示例: http://localhost:8000/api/v1
    # 生产服务:     https://accountapi.emoera.com/api
    PASSPORT_ENABLED: bool = True
    OIDC_ISSUER: str = "https://accountapi.emoera.com/api"
    OIDC_JWKS_URL: str = ""   # 缺省 = {OIDC_ISSUER}/.well-known/jwks.json
    OIDC_USERINFO_URL: str = ""  # 缺省 = {OIDC_ISSUER}/userinfo/
    OIDC_PROVIDER: str = "github"  # 授权登录用的 provider 名
    OIDC_CLIENT_ID: str = ""
    OIDC_CLIENT_SECRET: str = ""
    OIDC_REDIRECT_URI: str = "http://localhost:3001/callback"
    OIDC_SCOPE: str = "openid profile email"
    FRONTEND_URL: str = "http://localhost:3001"

    # --- 仅本地开发用（PASSPORT_ENABLED=false 时生效）---
    # 生产环境 PASSPORT_ENABLED=true，此登录端点自动禁用，不影响通行证登录。
    LOCAL_USER_ID: str = "dev:314"
    LOCAL_USER_NAME: str = "本地开发"


settings = Settings()
