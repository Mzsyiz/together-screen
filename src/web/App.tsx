import {
  type CSSProperties,
  Fragment,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  SHARE_RESOLUTION_DETAILS,
  SHARE_QUALITY_MODES,
  shareSettingsForMode,
} from "../shared/types";
import type {
  ActiveShare,
  ChatMessage,
  Participant,
  PublicUser,
  QualityLevel,
  RoomSummary,
  ShareSettings,
  ShareQualityMode,
} from "../shared/types";
import { api, ApiError } from "./api";
import { useRoomSession } from "./useRoomSession";

function mediaModeLabel(mode: RoomSummary["mediaMode"]): string {
  if (mode === "rtc") return "火山 RTC";
  if (mode === "wtn") return "火山 WTN";
  return "自建 P2P";
}

type IconName =
  | "screen"
  | "grid"
  | "focus"
  | "chat"
  | "settings"
  | "expand"
  | "sound"
  | "mute"
  | "mic"
  | "micOff"
  | "phoneOff"
  | "smile"
  | "send"
  | "users"
  | "logout"
  | "close"
  | "back"
  | "lock"
  | "arrow";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    screen: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    focus: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M8 9h8v6H8z" />
      </>
    ),
    chat: (
      <path d="M21 12a8 8 0 0 1-8 8H6l-4 2 1.5-4.5A8 8 0 1 1 21 12Z" />
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.87l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.13.34.34.68.6 1 .3.28.68.42 1.1.4H21v4h-.09a1.7 1.7 0 0 0-1.51.6Z" />
      </>
    ),
    expand: <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />,
    sound: (
      <>
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        <path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" />
      </>
    ),
    mute: (
      <>
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        <path d="m16 9 5 5M21 9l-5 5" />
      </>
    ),
    mic: (
      <>
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
      </>
    ),
    micOff: (
      <>
        <path d="M9 9v3a3 3 0 0 0 5.1 2.1M15 10V6a3 3 0 0 0-5.6-1.5" />
        <path d="M5 11a7 7 0 0 0 11.2 5.6M19 11a7 7 0 0 1-.3 2M12 18v3M9 21h6M3 3l18 18" />
      </>
    ),
    phoneOff: (
      <>
        <path d="M10.7 13.3a12 12 0 0 0 3.1 2.2l1.6-1.6a1.5 1.5 0 0 1 1.6-.3c1 .5 2.1.8 3.2 1a1.5 1.5 0 0 1 1.2 1.5v3.3a1.5 1.5 0 0 1-1.6 1.5A19 19 0 0 1 3.1 4.2 1.5 1.5 0 0 1 4.6 2.6h3.3A1.5 1.5 0 0 1 9.4 3.8c.2 1.1.5 2.2 1 3.2a1.5 1.5 0 0 1-.3 1.6l-1.5 1.5" />
        <path d="m3 3 18 18" />
      </>
    ),
    smile: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
      </>
    ),
    send: <path d="m22 2-7 20-4-9-9-4Z M22 2 11 13" />,
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    logout: (
      <>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="m16 17 5-5-5-5M21 12H9" />
      </>
    ),
    close: <path d="M18 6 6 18M6 6l12 12" />,
    back: <path d="m15 18-6-6 6-6" />,
    lock: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  };

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function Logo() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <span />
        <span />
      </span>
      <span>
        <b>Together</b>
        <small>SCREEN</small>
      </span>
    </div>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <Logo />
      <div className="loading-orbit" />
      <p>正在连接你们的放映室</p>
    </main>
  );
}

function LoginScreen({
  onLogin,
  notice,
}: {
  onLogin: (user: PublicUser) => void;
  notice?: string | null;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.login(username.trim(), password);
      await api.claim();
      onLogin(result.user);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <section className="login-story">
        <Logo />
        <div className="story-copy">
          <span className="eyebrow">A PRIVATE SCREENING SPACE</span>
          <h1>
            屏幕里的距离，
            <br />
            近在<span>眼前。</span>
          </h1>
          <p>
            进入朋友的房间，一起看视频、切画面、聊剧情。
            <br />
            每一次共享，都只在你们之间发生。
          </p>
        </div>
        <div className="story-screen">
          <div className="story-screen-bar">
            <i />
            <i />
            <i />
            <span>MOVIE NIGHT · 21:40</span>
          </div>
          <div className="story-scene">
            <span className="scene-moon" />
            <span className="scene-hill scene-hill-one" />
            <span className="scene-hill scene-hill-two" />
            <div className="scene-people">
              <i />
              <i />
              <i />
            </div>
          </div>
        </div>
        <p className="story-footnote">
          <Icon name="lock" size={14} /> 仅限受邀账号进入
        </p>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <span className="eyebrow">WELCOME BACK</span>
          <h2>进入放映室</h2>
          <p className="muted">使用管理员为你创建的账号登录</p>
          {notice && <p className="session-notice">{notice}</p>}
          <form onSubmit={submit}>
            <label>
              账号
              <input
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="输入账号"
                required
              />
            </label>
            <label>
              密码
              <span className="password-input">
                <input
                  autoComplete="current-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="输入密码"
                  required
                />
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? "隐藏" : "显示"}
                </button>
              </span>
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-button login-submit" disabled={busy}>
              {busy ? "正在进入…" : "进入房间大厅"}
              {!busy && <Icon name="arrow" />}
            </button>
          </form>
          <p className="login-help">暂不开放注册，请联系房间管理员添加账号。</p>
        </div>
      </section>
    </main>
  );
}

function Lobby({
  user,
  onEnterRoom,
  onOpenAdmin,
  onLogout,
}: {
  user: PublicUser;
  onEnterRoom: (room: RoomSummary) => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}) {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [error, setError] = useState("");

  const loadRooms = async () => {
    try {
      const result = await api.rooms();
      setRooms(result.rooms);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "房间列表加载失败");
    }
  };

  useEffect(() => {
    void loadRooms();
    const timer = window.setInterval(() => void loadRooms(), 4000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="lobby-page">
      <header className="topbar lobby-topbar">
        <Logo />
        <div className="topbar-actions">
          {user.isAdmin && (
            <button className="ghost-button" onClick={onOpenAdmin}>
              管理中心
            </button>
          )}
          <span className="user-chip">
            <span className="avatar small">{user.displayName.slice(0, 1)}</span>
            {user.displayName}
          </span>
          <button className="icon-button" aria-label="退出登录" onClick={onLogout}>
            <Icon name="logout" />
          </button>
        </div>
      </header>

      <section className="lobby-main">
        <div className="lobby-heading">
          <div>
            <span className="eyebrow">ROOM LOBBY</span>
            <h1>今晚，看点什么？</h1>
            <p>选择一间房，和已经在等你的朋友一起开始。</p>
          </div>
          <div className="live-note">
            <span className="live-dot" />
            {rooms.reduce((total, room) => total + room.occupants, 0)} 位朋友在线
          </div>
        </div>

        {error && <p className="inline-alert">{error}</p>}
        <div className="room-grid">
          {rooms.map((room, index) => (
            <article
              className={`room-card room-tone-${(index % 5) + 1} ${room.available ? "" : "full"}`}
              key={room.id}
            >
              <div className="room-card-head">
                <span className="room-capacity">10 人房</span>
                <span className={`room-status ${room.available ? "" : "is-full"}`}>
                  <i />
                  {room.available ? "可加入" : "已满"}
                </span>
              </div>
              <div className="room-visual">
                <div className="mini-screens">
                  {Array.from({ length: Math.min(room.capacity, 3) }).map((_, screen) => (
                    <span key={screen}>
                      <i />
                    </span>
                  ))}
                </div>
                <span className="room-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="room-card-foot">
                <div>
                  <h3>{room.name}</h3>
                  <p>
                    最多 {room.capacity} 人 ·{" "}
                    {mediaModeLabel(room.mediaMode)}
                  </p>
                </div>
                <button
                  className="round-enter"
                  disabled={!room.available}
                  aria-label={`进入${room.name}`}
                  onClick={() => onEnterRoom(room)}
                >
                  <Icon name="arrow" />
                </button>
              </div>
              <div className="seat-row">
                {Array.from({ length: room.capacity }).map((_, seat) => (
                  <span
                    className={seat < room.occupants ? "seat occupied" : "seat"}
                    key={seat}
                  />
                ))}
                <small>
                  {room.occupants}/{room.capacity}
                </small>
              </div>
            </article>
          ))}
        </div>

        <div className="lobby-tip">
          <div className="tip-icon">
            <Icon name="screen" />
          </div>
          <div>
            <b>共享很轻，加入很快</b>
            <p>
              进入房间后自动播放轻量预览；最近一帧用于切换画面时防止黑屏，点击预览即可切换高清。
            </p>
          </div>
        </div>
      </section>
      <footer className="lobby-footer">
        <span>TOGETHER SCREEN</span>
        <span>朋友之间的私人放映室</span>
      </footer>
    </main>
  );
}

function SettingsMenu({
  settings,
  sharing,
  mediaMode,
  onChange,
}: {
  settings: ShareSettings;
  sharing: boolean;
  mediaMode: RoomSummary["mediaMode"];
  onChange: (settings: ShareSettings) => void;
}) {
  const availableModes = (
    Object.keys(SHARE_QUALITY_MODES) as ShareQualityMode[]
  );
  const effectiveResolution = SHARE_RESOLUTION_DETAILS[settings.resolution];
  const degradationLabel =
    settings.degradationPreference === "maintain-resolution"
      ? "优先保持清晰度"
      : settings.degradationPreference === "maintain-framerate"
        ? "优先保持流畅度"
        : "清晰与流畅平衡";

  return (
    <details className="settings-menu">
      <summary className="ghost-button">
        <Icon name="settings" />
        投屏设置
      </summary>
      <div className="settings-popover">
        <div className="popover-title">
          <b>画质设置</b>
          <span>
            {sharing
              ? mediaMode === "wtn"
                ? "WTN 将重新发布"
                : mediaMode === "rtc"
                  ? "RTC 编码参数实时生效"
                : "实时生效"
              : "下次共享生效"}
          </span>
        </div>
        <p className="quality-limit-note">
          所有房间使用同一套标准画质
          <small>选择使用场景即可，系统自动匹配分辨率、帧率和码率</small>
        </p>
        <div className="quality-presets">
          {availableModes.map((mode) => {
            const profile = SHARE_QUALITY_MODES[mode];
            const effective = shareSettingsForMode(mode);
            return (
              <button
                key={mode}
                type="button"
                className={settings.qualityMode === mode ? "active" : ""}
                onClick={() =>
                  onChange({
                    ...effective,
                    systemAudioEnabled: settings.systemAudioEnabled,
                  })
                }
              >
                <b>{profile.name}</b>
                <span>{profile.description}</span>
                <em>
                  {SHARE_RESOLUTION_DETAILS[effective.resolution].display} ·{" "}
                  {effective.frameRate} FPS ·{" "}
                  {(effective.bitrateKbps / 1000).toFixed(1)} Mbps
                </em>
              </button>
            );
          })}
        </div>
        <div className="quality-profile-summary">
          <span>当前生效参数</span>
          <b>
            {SHARE_QUALITY_MODES[settings.qualityMode].name} ·{" "}
            {effectiveResolution.display} · {settings.frameRate} FPS ·{" "}
            {(settings.bitrateKbps / 1000).toFixed(1)} Mbps
          </b>
          <small>
            {degradationLabel} · WebRTC 会根据实际网络自动调节发送码率
          </small>
        </div>
        <p className="quality-standard-note">
          “标准”是默认推荐：优先保持文字和界面清晰。实际编码参数仍受屏幕源、
          浏览器性能和网络状况影响。
        </p>
        <label className="system-audio-toggle">
          <input
            type="checkbox"
            checked={settings.systemAudioEnabled}
            disabled={sharing}
            onChange={(event) =>
              onChange({
                ...settings,
                systemAudioEnabled: event.target.checked,
              })
            }
          />
          <span>
            <b>共享屏幕系统声音</b>
            <small>
              {sharing
                ? "共享过程中不能改变系统声音，请先停止共享"
                : "默认关闭；仅在你主动开启后，观看者点击高清画面才会播放"}
            </small>
          </span>
        </label>
      </div>
    </details>
  );
}

function VoiceSettingsMenu({
  session,
  currentUserId,
  outputMuted,
  onJoinVoice,
  onToggleOutputMuted,
}: {
  session: ReturnType<typeof useRoomSession>;
  currentUserId: string;
  outputMuted: boolean;
  onJoinVoice: () => void;
  onToggleOutputMuted: () => void;
}) {
  const voiceParticipants = session.participants.filter(
    (participant) => participant.voiceEnabled,
  );
  const connectedPeers = voiceParticipants.filter(
    (participant) =>
      participant.id !== currentUserId &&
      session.voicePeerStates[participant.id] === "connected",
  ).length;
  const permissionText =
    session.voicePermission === "denied"
      ? "麦克风权限已被浏览器拒绝"
      : session.voicePermission === "granted"
        ? "麦克风权限正常"
        : "首次加入时浏览器会询问麦克风权限";

  return (
    <details className="settings-menu voice-settings-menu">
      <summary className="ghost-button">
        <Icon name="mic" />
        语音设置
      </summary>
      <div className="settings-popover voice-popover">
        <div className="popover-title">
          <b>语音通话</b>
          <span>
            {session.voiceEnabled
              ? `${connectedPeers} 路已连接`
              : "未加入语音"}
          </span>
        </div>

        {!session.voiceEnabled ? (
          <div className="voice-join-card">
            <div>
              <b>加入房间语音</b>
              <span>
                {session.mediaMode === "rtc"
                  ? "通过火山 RTC 传输，麦克风与屏幕预览、高清切换完全独立"
                  : session.mediaMode === "wtn"
                  ? "通过火山引擎 WTN 发布和订阅语音"
                  : "使用 WebRTC 点对点传输，不经过业务服务器"}
              </span>
            </div>
            <button
              className="primary-button"
              disabled={session.voiceJoining}
              onClick={onJoinVoice}
            >
              <Icon name="mic" size={16} />
              {session.voiceJoining ? "正在打开麦克风…" : "加入语音"}
            </button>
          </div>
        ) : (
          <>
            <div className="voice-session-actions">
              <button
                className={session.voiceMuted ? "active" : ""}
                onClick={session.toggleVoiceMute}
              >
                <Icon
                  name={session.voiceMuted ? "micOff" : "mic"}
                  size={16}
                />
                {session.voiceMuted ? "取消静音" : "麦克风静音"}
              </button>
              <button onClick={session.leaveVoice}>
                <Icon name="phoneOff" size={16} />
                退出语音
              </button>
            </div>

            <label>
              麦克风设备
              <select
                value={session.selectedMicrophoneId}
                disabled={session.voiceSwitching}
                onChange={(event) => void session.switchMicrophone(event.target.value)}
              >
                <option value="">系统默认麦克风</option>
                {session.voiceInputDevices.map((device, index) => (
                  <option value={device.deviceId} key={`${device.deviceId}-${index}`}>
                    {device.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="range-label">
                麦克风增益
                <b>{Math.round(session.voiceInputGain * 100)}%</b>
              </span>
              <input
                type="range"
                min="0.2"
                max="2"
                step="0.05"
                value={session.voiceInputGain}
                onChange={(event) =>
                  session.setVoiceInputGain(Number(event.target.value))
                }
              />
            </label>

            <div className="voice-input-meter">
              <span>输入电平</span>
              <i>
                <b
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round((session.voiceLevels[currentUserId] ?? 0) * 100),
                    )}%`,
                  }}
                />
              </i>
              <em>{session.voiceMuted ? "已静音" : "实时"}</em>
            </div>
          </>
        )}

        <label>
          <span className="range-label">
            语音输出音量
            <b>{Math.round(session.voiceOutputVolume * 100)}%</b>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={session.voiceOutputVolume}
            onChange={(event) =>
              session.setVoiceOutputVolume(Number(event.target.value))
            }
          />
        </label>
        <button
          className={`voice-output-toggle ${outputMuted ? "muted" : ""}`}
          onClick={onToggleOutputMuted}
        >
          <Icon name={outputMuted ? "mute" : "sound"} size={16} />
          {outputMuted ? "打开房间声音" : "关闭房间声音"}
        </button>

        <div className="voice-participants">
          <div className="voice-participants-title">
            <b>语音成员</b>
            <span>{voiceParticipants.length} 人</span>
          </div>
          {voiceParticipants.length === 0 && (
            <p className="voice-empty">还没有人加入语音</p>
          )}
          {voiceParticipants.map((participant) => {
            const level = session.voiceLevels[participant.id] ?? 0;
            const speaking =
              participant.voiceEnabled &&
              !participant.voiceMuted &&
              level > 0.045;
            const peerState = session.voicePeerStates[participant.id];
            return (
              <div className="voice-participant" key={participant.id}>
                <Avatar participant={participant} small />
                <span>
                  <b>
                    {participant.id === currentUserId
                      ? `${participant.displayName}（你）`
                      : participant.displayName}
                  </b>
                  <small>
                    {participant.voiceMuted
                      ? "麦克风已静音"
                      : speaking
                        ? "正在说话"
                        : participant.id === currentUserId
                          ? "你正在语音中"
                          : peerState === "connected"
                            ? "语音已连接"
                            : "正在建立语音连接"}
                  </small>
                </span>
                <i
                  className={`voice-level ${speaking ? "speaking" : ""}`}
                  style={{ "--voice-level": Math.min(1, level * 5) } as CSSProperties}
                />
              </div>
            );
          })}
        </div>

        <p className={`voice-permission ${session.voicePermission}`}>
          <Icon
            name={session.voicePermission === "denied" ? "lock" : "mic"}
            size={14}
          />
          {permissionText}
        </p>
      </div>
    </details>
  );
}

function Avatar({ participant, small = false }: { participant: PublicUser; small?: boolean }) {
  return (
    <span className={`avatar ${small ? "small" : ""}`}>
      {participant.displayName.slice(0, 1).toUpperCase()}
    </span>
  );
}

function EmptyTile({ participant, isSelf }: { participant: Participant; isSelf: boolean }) {
  return (
    <div className="empty-tile">
      <Avatar participant={participant} />
      <b>{isSelf ? "你" : participant.displayName}</b>
      <span>{participant.isSharing ? "正在建立投屏…" : "还没有共享屏幕"}</span>
    </div>
  );
}

interface CachedVideoFrame {
  shareKey: string;
  dataUrl: string;
}

const LAST_FRAME_WIDTH = 640;
const lastFrameCache = new Map<string, CachedVideoFrame>();
const lastFrameCaptureHandlers = new Map<string, () => void>();

function shareFrameKey(participantId: string, share: ActiveShare | null): string {
  return share ? `${participantId}:${share.startedAt}` : participantId;
}

function captureLastFrameFor(participantId: string) {
  lastFrameCaptureHandlers.get(participantId)?.();
}

function VideoTile({
  participant,
  share,
  stream,
  isSelf,
  focused,
  muted,
  confirmedQuality,
  variant = "grid",
  onFocus,
  requestQuality,
}: {
  participant: Participant;
  share: ActiveShare | null;
  stream: MediaStream | null;
  isSelf: boolean;
  focused: boolean;
  muted: boolean;
  confirmedQuality?: QualityLevel;
  variant?: "grid" | "spotlight" | "strip";
  onFocus: () => void;
  requestQuality: (ownerId: string, quality: QualityLevel) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const tileRef = useRef<HTMLDivElement>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameKey = shareFrameKey(participant.id, share);
  const cachedFrame = lastFrameCache.get(participant.id);
  const [hasVideoFrame, setHasVideoFrame] = useState(false);
  const [lastFrame, setLastFrame] = useState<CachedVideoFrame | null>(
    cachedFrame?.shareKey === frameKey ? cachedFrame : null,
  );
  const active = Boolean(stream);
  const activeLastFrame =
    lastFrame?.shareKey === frameKey ? lastFrame.dataUrl : null;
  const showLastFrame = Boolean(activeLastFrame) && !hasVideoFrame;
  const showFramePlaceholder = !activeLastFrame && !stream;
  const hdConfirmed = confirmedQuality === "hd";
  const resolution = share?.settings.resolution ?? "720p";
  const resolutionLabel = SHARE_RESOLUTION_DETAILS[resolution].display;
  const resolutionName =
    resolution === "1440p"
      ? "2K"
      : resolution === "2160p"
        ? "4K"
        : resolution === "source"
          ? "原始分辨率"
          : resolution;
  const qualityModeName = share
    ? SHARE_QUALITY_MODES[share.settings.qualityMode].name
    : "标准";
  const qualityLabel = isSelf
    ? `本机共享 · ${qualityModeName} · ${resolutionName} · ${resolutionLabel}`
    : focused
      ? hdConfirmed
        ? `${qualityModeName} · ${resolutionName} · ${(share?.settings.bitrateKbps ?? 2500) / 1000} Mbps 上限`
        : "正在切换高清"
      : confirmedQuality === "low"
        ? "轻量预览 · 自动播放"
        : "正在连接轻量预览";

  const captureFrame = () => {
    const video = videoRef.current;
    if (
      !video ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      return null;
    }
    let canvas = frameCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      frameCanvasRef.current = canvas;
    }
    const width = Math.min(LAST_FRAME_WIDTH, video.videoWidth);
    const height = Math.max(
      1,
      Math.round((width / video.videoWidth) * video.videoHeight),
    );
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, width, height);
    const nextFrame = {
      shareKey: frameKey,
      dataUrl: canvas.toDataURL("image/jpeg", 0.68),
    };
    lastFrameCache.set(participant.id, nextFrame);
    return nextFrame;
  };

  useEffect(() => {
    setHasVideoFrame(false);
  }, [stream]);

  useEffect(() => {
    const cached = lastFrameCache.get(participant.id);
    setLastFrame(cached?.shareKey === frameKey ? cached : null);
  }, [frameKey, participant.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    const play = () => void video.play().catch(() => undefined);
    play();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") play();
    };
    window.addEventListener("focus", play);
    window.addEventListener("pageshow", play);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", play);
      window.removeEventListener("pageshow", play);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [stream]);

  useEffect(() => {
    if (isSelf) return;
    requestQuality(participant.id, focused ? "hd" : "low");
  }, [
    focused,
    frameKey,
    isSelf,
    participant.id,
    requestQuality,
  ]);

  useEffect(() => {
    if (isSelf || !stream) return;
    const timer = window.setInterval(() => {
      captureFrame();
    }, 1000);
    return () => {
      window.clearInterval(timer);
      const frame = captureFrame();
      if (frame) setLastFrame(frame);
    };
  }, [frameKey, isSelf, stream]);

  useEffect(() => {
    if (isSelf) return;
    const capture = () => {
      const frame = captureFrame();
      if (frame) setLastFrame(frame);
    };
    lastFrameCaptureHandlers.set(participant.id, capture);
    return () => {
      if (lastFrameCaptureHandlers.get(participant.id) === capture) {
        lastFrameCaptureHandlers.delete(participant.id);
      }
    };
  }, [frameKey, isSelf, participant.id, stream]);

  const fullscreen = async () => {
    try {
      await tileRef.current?.requestFullscreen();
    } catch {
      // Fullscreen can be denied by an embedding browser.
    }
  };

  if (!share) {
    return (
      <div className={`video-tile ${participant.isSharing ? "is-connecting" : ""}`}>
        <EmptyTile participant={participant} isSelf={isSelf} />
        <div className="tile-name">
          <span>{participant.displayName}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={tileRef}
      className={`video-tile has-video ${variant} ${focused ? "focused" : ""} ${active ? "previewing" : ""} ${hasVideoFrame ? "has-frame" : ""} ${activeLastFrame ? "has-last-frame" : ""}`}
      onClick={() => share && onFocus()}
      onDoubleClick={() => {
        if (variant === "spotlight") void fullscreen();
      }}
    >
      {stream ? (
        <video
          ref={videoRef}
          muted={isSelf || muted}
          autoPlay
          playsInline
          disablePictureInPicture
          onLoadedData={() => setHasVideoFrame(true)}
          onCanPlay={() => {
            setHasVideoFrame(true);
            void videoRef.current?.play().catch(() => undefined);
          }}
          onPlaying={() => setHasVideoFrame(true)}
          onWaiting={() => setHasVideoFrame(false)}
          onStalled={() => setHasVideoFrame(false)}
          onEmptied={() => setHasVideoFrame(false)}
          onError={() => setHasVideoFrame(false)}
        />
      ) : (
        <div className="stream-loading">
          <span className="spinner" />
          正在连接画面
        </div>
      )}
      {showLastFrame && activeLastFrame && (
        <img
          className="last-frame"
          src={activeLastFrame}
          alt={`${participant.displayName}的最近画面`}
        />
      )}
      {showFramePlaceholder && (
        <div className="last-frame-placeholder">
          <span className="spinner" />
          <span>正在获取最近画面</span>
        </div>
      )}
      {stream && !hasVideoFrame && (
        <div className="frame-buffering">
          <span className="spinner" />
          正在接收画面
        </div>
      )}
      {!isSelf && !stream && !activeLastFrame && (
        <div className="tile-name">
          <span>{participant.displayName}</span>
        </div>
      )}
      {(stream || activeLastFrame) && (
        <>
          <div className="tile-shade" />
          <div className="tile-name">
            <span>
              {isSelf ? "你的屏幕" : participant.displayName}
              {focused && hdConfirmed && <em>高清</em>}
            </span>
          </div>
          <button
            className="tile-expand"
            aria-label="全屏"
            onClick={(event) => {
              event.stopPropagation();
              void fullscreen();
            }}
          >
            <Icon name="expand" size={17} />
          </button>
          <span className="quality-pill">
            {qualityLabel}
          </span>
        </>
      )}
    </div>
  );
}

const messageTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
});

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatMessageDay(date: Date): string {
  const current = new Date();
  const yesterday = new Date();
  yesterday.setDate(current.getDate() - 1);
  if (dateKey(date) === dateKey(current)) return "今天";
  if (dateKey(date) === dateKey(yesterday)) return "昨天";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
  }).format(date);
}

function ChatPanel({
  messages,
  currentUser,
  onSendText,
}: {
  messages: ChatMessage[];
  currentUser: PublicUser;
  onSendText: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [atLatest, setAtLatest] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const emojis = ["😂", "🥹", "🤣", "😍", "🤔", "😭", "🔥", "✨", "👏", "🎬", "🍿", "❤️"];
  const textMessages = useMemo(
    () => messages.filter((message) => message.kind === "text" && message.text !== null),
    [messages],
  );

  useEffect(() => {
    const list = listRef.current;
    const added = Math.max(0, textMessages.length - previousMessageCountRef.current);
    previousMessageCountRef.current = textMessages.length;
    if (!list) return;
    if (stickToBottomRef.current) {
      list.scrollTop = list.scrollHeight;
      setAtLatest(true);
      setUnreadCount(0);
    } else if (added > 0) {
      setUnreadCount((current) => current + added);
    }
  }, [textMessages]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 42), 112)}px`;
  }, [text]);

  const send = async () => {
    const value = text.trim();
    if (!value || busy) return;
    stickToBottomRef.current = true;
    setBusy(true);
    setError("");
    try {
      await onSendText(value);
      setText("");
      setEmojiOpen(false);
      setUnreadCount(0);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "消息发送失败");
    } finally {
      setBusy(false);
    }
  };

  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  const jumpToLatest = () => {
    const list = listRef.current;
    if (!list) return;
    stickToBottomRef.current = true;
    list.scrollTop = list.scrollHeight;
    setAtLatest(true);
    setUnreadCount(0);
  };

  return (
    <aside className="chat-panel">
      <div className="chat-heading">
        <div>
          <b>房间聊天</b>
          <span>{textMessages.length ? `${textMessages.length} 条消息` : "消息会保存在这个房间"}</span>
        </div>
        <Icon name="chat" />
      </div>
      <div
        ref={listRef}
        className="message-list"
        onScroll={(event) => {
          const list = event.currentTarget;
          const latest = list.scrollHeight - list.scrollTop - list.clientHeight < 72;
          stickToBottomRef.current = latest;
          setAtLatest(latest);
          if (latest) setUnreadCount(0);
        }}
      >
        {textMessages.length === 0 && (
          <div className="empty-chat">
            <span>🍿</span>
            <b>这里还很安静</b>
            <p>发个表情，叫朋友一起开始看吧。</p>
          </div>
        )}
        {textMessages.map((message, index) => {
          const own = message.user.id === currentUser.id;
          const previous = textMessages[index - 1];
          const createdAt = new Date(message.createdAt);
          const previousCreatedAt = previous ? new Date(previous.createdAt) : null;
          const newDay =
            !previousCreatedAt || dateKey(createdAt) !== dateKey(previousCreatedAt);
          const compact =
            !newDay &&
            previous?.user.id === message.user.id &&
            createdAt.getTime() - (previousCreatedAt?.getTime() ?? 0) < 5 * 60 * 1000;
          return (
            <Fragment key={message.id}>
              {newDay && (
                <div className="date-separator" role="separator">
                  <span>{formatMessageDay(createdAt)}</span>
                </div>
              )}
              <article
                className={`message ${own ? "own" : ""} ${compact ? "compact" : ""}`}
                title={createdAt.toLocaleString("zh-CN")}
              >
                {compact ? (
                  <span className="message-avatar-space" aria-hidden="true" />
                ) : (
                  <Avatar participant={message.user} small />
                )}
                <div className="message-body">
                  {!compact && (
                    <div className="message-meta">
                      <b>{own ? "你" : message.user.displayName}</b>
                      <time dateTime={message.createdAt}>
                        {messageTimeFormatter.format(createdAt)}
                      </time>
                    </div>
                  )}
                  <div
                    className={`message-bubble ${
                      message.text && isEmojiOnly(message.text) ? "large-emoji" : ""
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              </article>
            </Fragment>
          );
        })}
      </div>
      {!atLatest && (
        <button className="chat-jump" onClick={jumpToLatest}>
          {unreadCount > 0 ? `${unreadCount} 条新消息` : "回到最新"}
          <Icon name="arrow" size={15} />
        </button>
      )}
      <div className="composer">
        {error && <p className="composer-error">{error}</p>}
        {emojiOpen && (
          <div className="emoji-drawer">
            {emojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  setText((current) => `${current}${emoji}`);
                  setEmojiOpen(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          placeholder="发消息给房间里的朋友…"
          aria-label="聊天消息"
          maxLength={2000}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={keyDown}
        />
        <div className="composer-actions">
          <button
            className={`icon-button compact ${emojiOpen ? "active" : ""}`}
            aria-label="表情"
            onClick={() => setEmojiOpen((open) => !open)}
          >
            <Icon name="smile" size={19} />
          </button>
          <div className="composer-send">
            <span className="composer-hint">
              {text.length > 1800 ? `${text.length}/2000` : "Enter 发送 · Shift+Enter 换行"}
            </span>
            <button
              className="send-button"
              aria-label="发送"
              disabled={busy || !text.trim()}
              onClick={() => void send()}
            >
              <Icon name="send" size={18} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function isEmojiOnly(text: string): boolean {
  const remaining = text.replace(
    /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u200D\s]/gu,
    "",
  );
  return remaining.length === 0 && text.trim().length > 0;
}

function VoiceAudioStream({
  stream,
  muted,
  volume,
}: {
  stream: MediaStream;
  muted: boolean;
  volume: number;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || muted) return;
    void audio.play().catch(() => undefined);
  }, [muted, stream]);

  return <audio ref={audioRef} autoPlay playsInline muted={muted} className="voice-audio-element" />;
}

function NoticeToast({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="toast" role="alert">
      <span>{message}</span>
      <div className="toast-actions">
        <button type="button" onClick={() => void copy()}>
          {copied ? "已复制" : "复制"}
        </button>
        <button type="button" aria-label="关闭错误提示" onClick={onClose}>
          <Icon name="close" size={15} />
        </button>
      </div>
    </div>
  );
}

function RoomView({
  user,
  room,
  onLeave,
  onSessionReplaced,
}: {
  user: PublicUser;
  room: RoomSummary;
  onLeave: () => void;
  onSessionReplaced: () => void;
}) {
  const session = useRoomSession(
    user,
    room.id,
    room.mediaMode,
    onSessionReplaced,
  );
  const [muted, setMuted] = useState(true);
  const [stageLayout, setStageLayout] = useState<"grid" | "spotlight">("grid");
  const stageRef = useRef<HTMLElement>(null);
  const previousShareIdsRef = useRef("");

  useEffect(() => {
    session.setRtcOutputMuted(muted);
  }, [muted, session.setRtcOutputMuted]);

  const ownShare = useMemo<ActiveShare | null>(
    () =>
      session.localStream
        ? {
            userId: user.id,
            user,
            poster: "",
            settings: session.settings,
            startedAt: new Date().toISOString(),
          }
        : null,
    [session.localStream, session.settings, user],
  );

  const sharingParticipants = useMemo(
    () =>
      session.participants.filter((participant) =>
        participant.id === user.id
          ? Boolean(ownShare)
          : Boolean(session.shares[participant.id]),
      ),
    [ownShare, session.participants, session.shares, user.id],
  );
  const shareIdsKey = sharingParticipants.map((participant) => participant.id).join("|");
  const focusedSharingParticipant = sharingParticipants.find(
    (participant) => participant.id === session.focusedUserId,
  );
  const mainParticipant =
    stageLayout === "spotlight"
      ? focusedSharingParticipant ?? sharingParticipants[0] ?? null
      : null;
  const secondaryParticipants = mainParticipant
    ? sharingParticipants.filter((participant) => participant.id !== mainParticipant.id)
    : [];

  useEffect(() => {
    if (session.focusedUserId && !focusedSharingParticipant) {
      session.focusShare(null);
    }
  }, [focusedSharingParticipant, session.focusedUserId, session.focusShare]);

  useEffect(() => {
    if (!shareIdsKey) {
      previousShareIdsRef.current = "";
      setStageLayout("grid");
      return;
    }
    if (!previousShareIdsRef.current) {
      setStageLayout("spotlight");
    }
    previousShareIdsRef.current = shareIdsKey;
  }, [shareIdsKey]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement && session.focusedUserId) {
        captureLastFrameFor(session.focusedUserId);
        session.focusShare(null);
        setStageLayout("grid");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [session.focusShare, session.focusedUserId]);

  const leaveRoom = () => {
    if (session.localStream) session.stopShare();
    onLeave();
  };

  const shareFor = (participant: Participant): ActiveShare | null =>
    participant.id === user.id ? ownShare : session.shares[participant.id] ?? null;

  const streamFor = (participant: Participant): MediaStream | null =>
    participant.id === user.id
      ? session.localStream
      : session.remoteStreams[participant.id] ?? null;

  const selectShare = (participant: Participant) => {
    if (
      session.focusedUserId &&
      session.focusedUserId !== participant.id
    ) {
      captureLastFrameFor(session.focusedUserId);
    }
    session.focusShare(participant.id);
    setStageLayout("spotlight");
  };

  const toggleStageLayout = () => {
    if (stageLayout === "grid") {
      const target = focusedSharingParticipant ?? sharingParticipants[0];
      if (target) session.focusShare(target.id);
      setStageLayout("spotlight");
    } else {
      if (session.focusedUserId) captureLastFrameFor(session.focusedUserId);
      session.focusShare(null);
      setStageLayout("grid");
    }
  };

  const toggleStageFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await stageRef.current?.requestFullscreen();
      }
    } catch {
      // Fullscreen can be disabled by the browser or an embedding page.
    }
  };

  return (
    <main className="room-page">
      <header className="room-topbar">
        <div className="room-top-left">
          <button className="icon-button" aria-label="返回大厅" onClick={leaveRoom}>
            <Icon name="back" />
          </button>
          <Logo />
          <span className="topbar-divider" />
          <div className="room-title">
            <b>{room.name}</b>
            <span>
              {session.participants.length}/{room.capacity} 人 ·{" "}
              {mediaModeLabel(room.mediaMode)}
            </span>
          </div>
        </div>
        <div className="room-top-actions">
          <span className={`connection-state ${session.connectionState}`}>
            <i />
            {session.connectionState === "connected"
              ? "信号已连接"
              : session.connectionState === "connecting"
                ? "连接中"
                : "正在重连"}
          </span>
          <span className="topbar-room-count">{session.participants.length} 人在线</span>
        </div>
      </header>

      <div className="room-body">
        <section className="stage" ref={stageRef}>
          <div className="stage-meta">
            <div>
              <span className="eyebrow">LIVE ROOM</span>
              <h2>
                {mainParticipant
                  ? `${mainParticipant.displayName} 的屏幕`
                  : sharingParticipants.length > 0
                    ? "多人共享画面"
                    : "等待屏幕共享"}
              </h2>
            </div>
            <div className="stage-meta-right">
              <span className="stage-voice-count">
                <Icon name="mic" size={13} />
                {session.participants.filter((participant) => participant.voiceEnabled).length}
              </span>
              <span className="stage-share-count">
                <i />
                {sharingParticipants.length} 路共享
              </span>
              <div className="participant-stack">
                {session.participants.map((participant) => (
                  <span
                    className={`stacked-avatar ${
                      participant.voiceEnabled ? "voice-active" : ""
                    } ${participant.voiceMuted ? "voice-muted" : ""} ${
                      participant.voiceEnabled &&
                      !participant.voiceMuted &&
                      (session.voiceLevels[participant.id] ?? 0) > 0.045
                        ? "voice-speaking"
                        : ""
                    }`}
                    key={participant.id}
                    title={`${participant.displayName}${
                      participant.voiceEnabled
                        ? participant.voiceMuted
                          ? " · 语音静音"
                          : (session.voiceLevels[participant.id] ?? 0) > 0.045
                            ? " · 正在说话"
                            : " · 语音中"
                        : ""
                    }`}
                  >
                    {participant.displayName.slice(0, 1)}
                  </span>
                ))}
                <small>{session.participants.length} 人在房间</small>
              </div>
            </div>
          </div>

          {sharingParticipants.length === 0 && (
            <div className="stage-empty">
              <span className="stage-empty-icon">
                <Icon name="screen" size={28} />
              </span>
              <span className="eyebrow">READY TO SHARE</span>
              <h3>还没有人共享屏幕</h3>
              <p>共享一个窗口或完整屏幕，房间里的朋友会看到最新画面。</p>
              <div className="stage-empty-people">
                {session.participants.map((participant) => (
                  <Avatar participant={participant} small key={participant.id} />
                ))}
              </div>
              <button
                className="primary-button stage-empty-action"
                disabled={session.shareStarting}
                onClick={() => void session.startShare()}
              >
                <Icon name="screen" />
                {session.shareStarting ? "正在启动共享…" : "共享我的屏幕"}
              </button>
            </div>
          )}

          {sharingParticipants.length > 0 && stageLayout === "grid" && (
            <div
              className="video-grid"
              data-count={Math.max(sharingParticipants.length, 1)}
            >
              {sharingParticipants.map((participant) => (
                <VideoTile
                  key={participant.id}
                  participant={participant}
                  share={shareFor(participant)}
                  stream={streamFor(participant)}
                  isSelf={participant.id === user.id}
                  focused={false}
                  muted={muted}
                  confirmedQuality={session.confirmedQuality[participant.id]}
                  onFocus={() => selectShare(participant)}
                  requestQuality={session.requestQuality}
                />
              ))}
            </div>
          )}

          {sharingParticipants.length > 0 && stageLayout === "spotlight" && mainParticipant && (
            <div className={`spotlight-stage ${secondaryParticipants.length ? "" : "single"}`}>
              <VideoTile
                key={mainParticipant.id}
                participant={mainParticipant}
                share={shareFor(mainParticipant)}
                stream={streamFor(mainParticipant)}
                isSelf={mainParticipant.id === user.id}
                focused={focusedSharingParticipant?.id === mainParticipant.id}
                muted={muted}
                confirmedQuality={session.confirmedQuality[mainParticipant.id]}
                variant="spotlight"
                onFocus={() => {
                  if (focusedSharingParticipant?.id !== mainParticipant.id) {
                    selectShare(mainParticipant);
                  }
                }}
                requestQuality={session.requestQuality}
              />
              {secondaryParticipants.length > 0 && (
                <aside className="share-strip" aria-label="其他共享画面">
                  <span className="share-strip-label">
                    其他共享
                    <b>{secondaryParticipants.length}</b>
                  </span>
                  {secondaryParticipants.map((participant) => (
                    <VideoTile
                      key={participant.id}
                      participant={participant}
                      share={shareFor(participant)}
                      stream={streamFor(participant)}
                      isSelf={participant.id === user.id}
                      focused={false}
                      muted={muted}
                      confirmedQuality={session.confirmedQuality[participant.id]}
                      variant="strip"
                      onFocus={() => selectShare(participant)}
                      requestQuality={session.requestQuality}
                    />
                  ))}
                </aside>
              )}
            </div>
          )}

          <div className="stage-controls">
            <button
              className={`meeting-control share-control ${session.localStream ? "active" : ""}`}
              disabled={session.shareStarting}
              onClick={() => {
                if (session.localStream) session.stopShare();
                else void session.startShare();
              }}
            >
              <Icon name="screen" size={19} />
              <span>
                {session.localStream
                  ? "停止共享"
                  : session.shareStarting
                    ? "正在启动…"
                    : "共享屏幕"}
              </span>
            </button>
            <button
              className={`meeting-control ${muted ? "" : "active"}`}
              onClick={() => setMuted((value) => !value)}
            >
              <Icon name={muted ? "mute" : "sound"} size={19} />
              <span>{muted ? "打开声音" : "关闭声音"}</span>
            </button>
            <button
              className={`meeting-control voice-control ${
                session.voiceEnabled && !session.voiceMuted ? "active" : ""
              } ${session.voiceMuted ? "muted" : ""} ${
                (session.voiceLevels[user.id] ?? 0) > 0.045 ? "speaking" : ""
              }`}
              disabled={session.voiceJoining}
              onClick={() => {
                if (!session.voiceEnabled) {
                  setMuted(false);
                  void session.joinVoice();
                } else {
                  session.toggleVoiceMute();
                }
              }}
            >
              <Icon
                name={session.voiceEnabled && !session.voiceMuted ? "mic" : "micOff"}
                size={19}
              />
              <span>
                {!session.voiceEnabled
                  ? session.voiceJoining
                    ? "正在连接语音"
                    : "加入语音"
                  : session.voiceMuted
                    ? "取消静音"
                    : "麦克风已开启"}
              </span>
            </button>
            {session.voiceEnabled && (
              <button
                className="meeting-control danger-control"
                onClick={session.leaveVoice}
              >
                <Icon name="phoneOff" size={19} />
                <span>退出语音</span>
              </button>
            )}
            <SettingsMenu
              settings={session.settings}
              sharing={Boolean(session.localStream)}
              mediaMode={session.mediaMode}
              onChange={(settings) => void session.updateSettings(settings)}
            />
            <VoiceSettingsMenu
              session={session}
              currentUserId={user.id}
              outputMuted={muted}
              onJoinVoice={() => {
                setMuted(false);
                void session.joinVoice();
              }}
              onToggleOutputMuted={() => setMuted((value) => !value)}
            />
            <button
              className="meeting-control"
              onClick={toggleStageLayout}
              disabled={sharingParticipants.length === 0}
            >
              <Icon name={stageLayout === "grid" ? "grid" : "focus"} size={19} />
              <span>{stageLayout === "grid" ? "焦点视图" : "宫格视图"}</span>
            </button>
            <button
              className="meeting-control"
              onClick={() => void toggleStageFullscreen()}
              disabled={sharingParticipants.length === 0}
            >
              <Icon name="expand" size={19} />
              <span>全屏</span>
            </button>
          </div>
        </section>
        <ChatPanel
          messages={session.messages}
          currentUser={user}
          onSendText={session.sendText}
        />
      </div>
      <div className="voice-audio-output" aria-hidden="true">
        {Object.entries(session.voiceStreams).map(([userId, stream]) => (
          <VoiceAudioStream
            key={userId}
            stream={stream}
            muted={muted}
            volume={session.voiceOutputVolume}
          />
        ))}
      </div>

      {session.notice && (
        <NoticeToast
          message={session.notice}
          onClose={session.clearNotice}
        />
      )}
    </main>
  );
}

function AdminDialog({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [wtnEnabled, setWtnEnabled] = useState(false);
  const [rtcEnabled, setRtcEnabled] = useState(false);
  const [roomBusy, setRoomBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    username: "",
    displayName: "",
    password: "",
    isAdmin: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [userResult, roomResult] = await Promise.all([
        api.adminUsers(),
        api.adminRooms(),
      ]);
      setUsers(userResult.users);
      setRooms(roomResult.rooms);
      setWtnEnabled(roomResult.wtnEnabled);
      setRtcEnabled(roomResult.rtcEnabled);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "管理数据加载失败",
      );
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.createUser(form);
      setForm({ username: "", displayName: "", password: "", isAdmin: false });
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建账号失败");
    } finally {
      setBusy(false);
    }
  };

  const updateRoomMode = async (
    room: RoomSummary,
    mode: RoomSummary["mediaMode"],
  ) => {
    setRoomBusy(room.id);
    setError("");
    try {
      const result = await api.updateRoomMedia(room.id, mode);
      setRooms((current) =>
        current.map((candidate) =>
          candidate.id === room.id ? result.room : candidate,
        ),
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : "媒体模式更新失败",
      );
    } finally {
      setRoomBusy(null);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="admin-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">SYSTEM ADMIN</span>
            <h2>管理中心</h2>
          </div>
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="admin-content">
          <form className="admin-form" onSubmit={submit}>
            <h3>添加新用户</h3>
            <label>
              登录账号
              <input
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
                placeholder="例如 alice"
                required
              />
            </label>
            <label>
              昵称
              <input
                value={form.displayName}
                onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                placeholder="朋友看到的名字"
                required
              />
            </label>
            <label>
              初始密码
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="至少 8 位"
                minLength={8}
                required
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.isAdmin}
                onChange={(event) => setForm({ ...form, isAdmin: event.target.checked })}
              />
              同时授予管理员权限
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-button" disabled={busy}>
              {busy ? "创建中…" : "创建账号"}
            </button>
            <div className="admin-room-modes">
              <div>
                <h3>房间媒体线路</h3>
                <span>
                  {rtcEnabled || wtnEnabled
                    ? "10 个房间均可独立选择自建、火山 RTC 或 WTN"
                    : "配置火山 RTC 或 WTN 凭证后可在房间中切换线路"}
                </span>
              </div>
              {rooms.map((room) => (
                <label key={room.id}>
                  <span>
                    {room.name}
                    <small>{room.occupants} 人在线</small>
                  </span>
                  <select
                    value={room.mediaMode}
                    disabled={room.occupants > 0 || roomBusy === room.id}
                    onChange={(event) =>
                      void updateRoomMode(
                        room,
                        event.target.value as RoomSummary["mediaMode"],
                      )
                    }
                  >
                    <option value="p2p">自建 P2P / TURN</option>
                    <option value="wtn" disabled={!wtnEnabled}>
                      火山引擎 WTN
                    </option>
                    <option value="rtc" disabled={!rtcEnabled}>
                      火山引擎 RTC
                    </option>
                  </select>
                </label>
              ))}
              <small>房间内有人时不允许切换，避免中断正在传输的媒体。</small>
            </div>
          </form>
          <div className="admin-users">
            <h3>已有账号 <span>{users.length}</span></h3>
            <div className="admin-user-list">
              {users.map((user) => (
                <div className="admin-user" key={user.id}>
                  <Avatar participant={user} />
                  <span>
                    <b>{user.displayName}</b>
                    <small>@{user.username}</small>
                  </span>
                  {user.isAdmin && <em>管理员</em>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<PublicUser | null | undefined>(undefined);
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [loginNotice, setLoginNotice] = useState<string | null>(null);

  const handleSessionExpired = () => {
    setRoom(null);
    setUser(null);
    setLoginNotice("账号已在其他设备登录，请重新登录");
  };

  useEffect(() => {
    void (async () => {
      try {
        const result = await api.me();
        await api.claim();
        setUser(result.user);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
          console.error(error);
        }
        setUser(null);
      }
    })();
  }, []);

  useEffect(() => {
    window.addEventListener("together:session-expired", handleSessionExpired);
    return () =>
      window.removeEventListener("together:session-expired", handleSessionExpired);
  }, []);

  if (user === undefined) return <LoadingScreen />;
  if (!user) {
    return (
      <LoginScreen
        notice={loginNotice}
        onLogin={(nextUser) => {
          setLoginNotice(null);
          setUser(nextUser);
        }}
      />
    );
  }
  if (room) {
    return (
      <RoomView
        user={user}
        room={room}
        onLeave={() => setRoom(null)}
        onSessionReplaced={handleSessionExpired}
      />
    );
  }

  return (
    <>
      <Lobby
        user={user}
        onEnterRoom={setRoom}
        onOpenAdmin={() => setAdminOpen(true)}
        onLogout={() => {
          void api.logout().finally(() => {
            setLoginNotice(null);
            setUser(null);
          });
        }}
      />
      {adminOpen && <AdminDialog onClose={() => setAdminOpen(false)} />}
    </>
  );
}
