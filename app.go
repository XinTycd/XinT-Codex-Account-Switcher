package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	_ "embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/getlantern/systray"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/sys/windows/registry"
)

const (
	AppTitle              = "XinT Codex Account Switcher"
	AppVersion            = "v1.0.0"
	defaultOAuthClientID  = "app_EMoamEEZ73f0CkXaXp7hrann"
	oauthAuthorizeBase    = "https://auth.openai.com"
	oauthTokenEndpoint    = "https://auth.openai.com/oauth/token"
	chatGPTDesktopAuthURL = "https://chatgpt.com/codex/desktop-auth"
	chatGPTUsageEndpoint  = "https://chatgpt.com/backend-api/wham/usage"
	fetchTimeout          = 12 * time.Second
	oauthTimeout          = 10 * time.Minute
	runtimeCacheTTL       = 3 * time.Second
	usageCacheTTL         = 5 * time.Minute
	appxCacheTTL          = 5 * time.Minute
	callbackHost          = "127.0.0.1"
	callbackPort          = 1455
	callbackPath          = "/auth/callback"
)

//go:embed assets/app-icon.ico
var trayIconICO []byte

var trackedFiles = []string{
	"auth.json",
	".codex-global-state.json",
	"config.toml",
	"installation_id",
	"cap_sid",
}

var slugPattern = regexp.MustCompile(`[^\pL\pN._-]+`)

type App struct {
	ctx                context.Context
	codexHome          string
	defaultAppDataPath string

	mu                sync.Mutex
	settingsCache     AppSettings
	currentUsageCache *currentUsageCache
	runtimeCache      cachedRuntimeSummary
	appxLaunchCache   cachedLaunchTarget
	activeOAuth       *oauthFlow
	isQuitting        bool
	trayReady         bool
}

type AppSettings struct {
	Language        string `json:"language"`
	LaunchAtStartup bool   `json:"launchAtStartup"`
	DarkMode        bool   `json:"darkMode"`
	CloseBehavior   string `json:"closeBehavior"`
	AppDataPath     string `json:"appDataPath"`
	ConfigTomlMode  string `json:"configTomlMode"`
}

type LaunchTarget struct {
	Kind   string `json:"kind"`
	Target string `json:"target"`
}

type RuntimeProcess struct {
	ProcessName string `json:"ProcessName"`
	ID          int    `json:"Id"`
	Path        string `json:"Path,omitempty"`
}

type RuntimeSummary struct {
	RunningCount int              `json:"runningCount"`
	Running      []RuntimeProcess `json:"running"`
	LaunchTarget *LaunchTarget    `json:"launchTarget,omitempty"`
}

type UsageWindow struct {
	LimitName        string   `json:"limitName,omitempty"`
	UsedPercent      float64  `json:"usedPercent"`
	RemainingPercent float64  `json:"remainingPercent"`
	WindowMinutes    float64  `json:"windowMinutes"`
	ResetsAt         *float64 `json:"resetsAt,omitempty"`
}

type UsageSummary struct {
	AccountID string       `json:"accountId,omitempty"`
	Email     string       `json:"email,omitempty"`
	PlanType  string       `json:"planType,omitempty"`
	FiveHour  *UsageWindow `json:"fiveHour,omitempty"`
	Weekly    *UsageWindow `json:"weekly,omitempty"`
}

type StateSummary struct {
	AuthMode     string        `json:"authMode,omitempty"`
	LastRefresh  string        `json:"lastRefresh,omitempty"`
	APIKeyMasked string        `json:"apiKeyMasked,omitempty"`
	TokenKeys    []string      `json:"tokenKeys,omitempty"`
	Fingerprint  string        `json:"fingerprint,omitempty"`
	IdentityKey  string        `json:"identityKey,omitempty"`
	AccountID    string        `json:"accountId,omitempty"`
	UserID       string        `json:"userId,omitempty"`
	Email        string        `json:"email,omitempty"`
	PlanType     string        `json:"planType,omitempty"`
	Usage        *UsageSummary `json:"usage,omitempty"`
	UsageError   string        `json:"usageError,omitempty"`
}

type ProfileMetadata struct {
	ID             string        `json:"id"`
	Name           string        `json:"name"`
	CreatedAt      string        `json:"createdAt"`
	UpdatedAt      string        `json:"updatedAt"`
	SortOrder      int           `json:"sortOrder"`
	AuthMode       string        `json:"authMode,omitempty"`
	LastRefresh    string        `json:"lastRefresh,omitempty"`
	APIKeyMasked   string        `json:"apiKeyMasked,omitempty"`
	TokenKeys      []string      `json:"tokenKeys,omitempty"`
	Fingerprint    string        `json:"fingerprint,omitempty"`
	IdentityKey    string        `json:"identityKey,omitempty"`
	AccountID      string        `json:"accountId,omitempty"`
	UserID         string        `json:"userId,omitempty"`
	Email          string        `json:"email,omitempty"`
	PlanType       string        `json:"planType,omitempty"`
	Usage          *UsageSummary `json:"usage,omitempty"`
	UsageError     string        `json:"usageError,omitempty"`
	UsageUpdatedAt string        `json:"usageUpdatedAt,omitempty"`
	IsActive       bool          `json:"isActive,omitempty"`
}

type AppState struct {
	CodexHome          string            `json:"codexHome"`
	DefaultAppDataPath string            `json:"defaultAppDataPath"`
	AppDataPath        string            `json:"appDataPath"`
	AppVersion         string            `json:"appVersion"`
	Settings           AppSettings       `json:"settings"`
	TrackedFiles       []string          `json:"trackedFiles"`
	Runtime            RuntimeSummary    `json:"runtime"`
	Current            StateSummary      `json:"current"`
	Profiles           []ProfileMetadata `json:"profiles"`
	LastAction         *LastAction       `json:"lastAction,omitempty"`
}

type LastAction struct {
	Type        string `json:"type"`
	ProfileID   string `json:"profileId,omitempty"`
	ProfileName string `json:"profileName,omitempty"`
	BackupDir   string `json:"backupDir,omitempty"`
}

type currentUsageCache struct {
	IdentityKey string
	Usage       *UsageSummary
	UsageError  string
	PlanType    string
	AccountID   string
	Email       string
	UpdatedAt   time.Time
}

type cachedRuntimeSummary struct {
	Value     *RuntimeSummary
	FetchedAt time.Time
}

type cachedLaunchTarget struct {
	Value     *LaunchTarget
	FetchedAt time.Time
}

type oauthFlow struct {
	cancel context.CancelFunc
}

type authCodeWaiter struct {
	server      *http.Server
	listener    net.Listener
	resultCh    chan authCodeResult
	redirectURI string
}

type authCodeResult struct {
	code string
	err  error
}

type AuthRecord struct {
	AuthMode     string      `json:"auth_mode,omitempty"`
	OpenAIAPIKey string      `json:"OPENAI_API_KEY"`
	Tokens       *AuthTokens `json:"tokens,omitempty"`
	LastRefresh  string      `json:"last_refresh,omitempty"`
}

type AuthTokens struct {
	IDToken      string `json:"id_token,omitempty"`
	AccessToken  string `json:"access_token,omitempty"`
	RefreshToken string `json:"refresh_token,omitempty"`
	AccountID    string `json:"account_id,omitempty"`
}

type authIdentity struct {
	IdentityKey string
	AccountID   string
	UserID      string
	Email       string
	PlanType    string
	ClientID    string
}

type usagePayload struct {
	AccountID            string                `json:"account_id"`
	Email                string                `json:"email"`
	PlanType             string                `json:"plan_type"`
	RateLimit            usageRateLimit        `json:"rate_limit"`
	AdditionalRateLimits []additionalRateLimit `json:"additional_rate_limits"`
}

type additionalRateLimit struct {
	LimitName string         `json:"limit_name"`
	RateLimit usageRateLimit `json:"rate_limit"`
}

type usageRateLimit struct {
	PrimaryWindow   *usageWindow `json:"primary_window"`
	SecondaryWindow *usageWindow `json:"secondary_window"`
}

type usageWindow struct {
	UsedPercent       float64  `json:"used_percent"`
	LimitWindowSecond float64  `json:"limit_window_seconds"`
	ResetAt           *float64 `json:"reset_at"`
}

type oauthTokenResponse struct {
	AccessToken  string `json:"access_token"`
	IDToken      string `json:"id_token"`
	RefreshToken string `json:"refresh_token"`
	AccountID    string `json:"account_id"`
}

type listProfilesResult struct {
	Current  StateSummary
	Profiles []ProfileMetadata
}

func NewApp() *App {
	homeDir, _ := os.UserHomeDir()
	defaultPath := detectDefaultAppDataPath()

	return &App{
		codexHome:          filepath.Join(homeDir, ".codex"),
		defaultAppDataPath: defaultPath,
		settingsCache:      defaultAppSettings(),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	settings, _ := readAppSettings(a.defaultAppDataPath)
	a.mu.Lock()
	a.settingsCache = settings
	a.mu.Unlock()
	_ = a.setLaunchAtStartup(settings.LaunchAtStartup)
}

func (a *App) beforeClose(ctx context.Context) bool {
	a.mu.Lock()
	isQuitting := a.isQuitting
	a.mu.Unlock()
	if !isQuitting && a.getSettings().CloseBehavior == "background" {
		runtime.Hide(ctx)
		return true
	}

	return false
}

func (a *App) onTrayReady() {
	systray.SetIcon(trayIconICO)
	systray.SetTitle("XinT Codex Account Switcher")
	systray.SetTooltip("XinT Codex Account Switcher")

	showItem := systray.AddMenuItem("显示主窗口", "显示 XinT Codex Account Switcher")
	systray.AddSeparator()
	quitItem := systray.AddMenuItem("退出程序", "退出 XinT Codex Account Switcher")

	a.mu.Lock()
	a.trayReady = true
	a.mu.Unlock()

	go func() {
		for {
			select {
			case <-showItem.ClickedCh:
				if a.ctx != nil {
					runtime.Show(a.ctx)
					runtime.WindowUnminimise(a.ctx)
					runtime.WindowCenter(a.ctx)
				}
			case <-quitItem.ClickedCh:
				a.mu.Lock()
				a.isQuitting = true
				a.mu.Unlock()
				if a.ctx != nil {
					runtime.Quit(a.ctx)
				}
				return
			}
		}
	}()
}

func (a *App) onTrayExit() {}

func (a *App) LoadState() (*AppState, error) {
	return a.buildState(nil)
}

func (a *App) RefreshUsageState(force bool) (*AppState, error) {
	settings := a.getSettings()
	tracked := getTrackedFilesForSettings(settings)
	profilesState, err := a.listProfiles(tracked)
	if err != nil {
		return nil, err
	}

	current, err := a.enrichCurrentState(tracked)
	if err != nil {
		return nil, err
	}
	a.updateCurrentUsageCache(current)

	profiles, err := a.enrichProfiles(profilesState.Profiles, force, tracked)
	if err != nil {
		return nil, err
	}

	return a.buildState(&stateOverrides{
		ProfilesState: profilesState,
		Current:       &current,
		Profiles:      profiles,
	})
}

func (a *App) CreateProfile(name string) (*AppState, error) {
	settings := a.getSettings()
	_, err := a.createProfileFromCurrent(strings.TrimSpace(name), getTrackedFilesForSettings(settings))
	if err != nil {
		return nil, err
	}
	a.clearCurrentUsageCache()
	return a.buildState(nil)
}

func (a *App) CreateProfileWithOAuth() (*AppState, error) {
	a.mu.Lock()
	if a.activeOAuth != nil {
		a.mu.Unlock()
		return nil, errors.New("当前已有一个网页授权流程正在进行。")
	}
	flowCtx, cancel := context.WithCancel(context.Background())
	a.activeOAuth = &oauthFlow{cancel: cancel}
	a.mu.Unlock()

	defer func() {
		a.mu.Lock()
		a.activeOAuth = nil
		a.mu.Unlock()
	}()

	clientID, err := a.resolveOAuthClientID()
	if err != nil {
		return nil, err
	}

	tokens, err := a.runDesktopOAuthFlow(flowCtx, clientID)
	if err != nil {
		return nil, err
	}

	auth := buildChatGPTAuthRecord(tokens)
	profileBaseID := auth.Tokens.AccountID
	if profileBaseID == "" {
		profileBaseID = fmt.Sprintf("oauth-%d", time.Now().UnixMilli())
	}

	settings := a.getSettings()
	created, err := a.createProfileFromAuth(profileBaseID, auth, profileBaseID, getTrackedFilesForSettings(settings))
	if err != nil {
		return nil, err
	}

	state, err := a.buildState(nil)
	if err != nil {
		return nil, err
	}
	state.LastAction = &LastAction{
		Type:      "oauth-create",
		ProfileID: created.ID,
	}
	return state, nil
}

func (a *App) CancelOAuthLogin() (map[string]bool, error) {
	a.mu.Lock()
	flow := a.activeOAuth
	a.mu.Unlock()
	if flow == nil {
		return map[string]bool{"cancelled": false}, nil
	}

	flow.cancel()
	return map[string]bool{"cancelled": true}, nil
}

func (a *App) ImportAuthProfile() (*AppState, error) {
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择 auth.json",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON", Pattern: "*.json"},
			{DisplayName: "All Files", Pattern: "*.*"},
		},
	})
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(filePath) == "" {
		state, buildErr := a.buildState(nil)
		if buildErr != nil {
			return nil, buildErr
		}
		state.LastAction = &LastAction{Type: "import-cancelled"}
		return state, nil
	}

	auth, err := readAuthFileByPath(filePath)
	if err != nil {
		return nil, errors.New("选中的文件不是有效的 auth.json。")
	}
	if auth.AuthMode == "" && auth.OpenAIAPIKey == "" && auth.Tokens == nil {
		return nil, errors.New("auth.json 缺少可识别的认证字段。")
	}

	identity := getAuthIdentity(auth)
	profileBaseID := firstNonEmpty(identity.AccountID, identity.Email, strings.TrimSuffix(filepath.Base(filePath), filepath.Ext(filePath)))
	name := firstNonEmpty(identity.Email, identity.AccountID, profileBaseID)
	settings := a.getSettings()
	created, err := a.createProfileFromAuth(profileBaseID, auth, name, getTrackedFilesForSettings(settings))
	if err != nil {
		return nil, err
	}

	a.clearCurrentUsageCache()
	state, err := a.buildState(nil)
	if err != nil {
		return nil, err
	}
	state.LastAction = &LastAction{
		Type:      "import-auth",
		ProfileID: created.ID,
	}
	return state, nil
}

func (a *App) RenameProfile(profileID, newName string) (*AppState, error) {
	if err := a.renameProfile(profileID, newName); err != nil {
		return nil, err
	}
	return a.buildState(nil)
}

func (a *App) ReorderProfiles(profileIDs []string) (*AppState, error) {
	if err := a.reorderProfiles(profileIDs); err != nil {
		return nil, err
	}
	return a.buildState(nil)
}

func (a *App) DeleteProfile(profileID string) (*AppState, error) {
	if err := a.deleteProfile(profileID); err != nil {
		return nil, err
	}
	return a.buildState(nil)
}

func (a *App) ExportAuthJson(profileID, profileName string) (map[string]any, error) {
	profileID = strings.TrimSpace(profileID)
	if profileID == "" {
		return nil, errors.New("缺少档案 ID。")
	}

	authPath := filepath.Join(a.profileSnapshotDir(profileID), "auth.json")
	if !pathExists(authPath) {
		return nil, errors.New("该档案没有可导出的 auth.json。")
	}

	safeName := sanitizeFileName(firstNonEmpty(profileName, profileID, "auth"))
	savePath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "导出 auth.json",
		DefaultFilename: safeName + "-auth.json",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON", Pattern: "*.json"},
			{DisplayName: "All Files", Pattern: "*.*"},
		},
	})
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(savePath) == "" {
		return map[string]any{"cancelled": true}, nil
	}

	if err := copyFile(authPath, savePath); err != nil {
		return nil, err
	}

	return map[string]any{
		"cancelled": false,
		"filePath":  savePath,
	}, nil
}

func (a *App) ApplyProfile(profileID string, relaunch bool) (*AppState, error) {
	settings := a.getSettings()
	tracked := getTrackedFilesForSettings(settings)

	if err := a.stopCodexProcesses(); err != nil {
		return nil, err
	}
	a.invalidateRuntimeCache()

	profile, backupDir, err := a.applyProfile(profileID, tracked)
	if err != nil {
		return nil, err
	}

	if relaunch {
		if _, err := a.launchCodex(); err != nil {
			return nil, err
		}
	}

	a.clearCurrentUsageCache()
	a.invalidateRuntimeCache()
	state, err := a.buildState(nil)
	if err != nil {
		return nil, err
	}
	state.LastAction = &LastAction{
		Type:        "apply",
		ProfileName: profile.Name,
		BackupDir:   backupDir,
	}
	return state, nil
}

func (a *App) RestartCodex() (*AppState, error) {
	if err := a.stopCodexProcesses(); err != nil {
		return nil, err
	}
	if _, err := a.launchCodex(); err != nil {
		return nil, err
	}
	a.invalidateRuntimeCache()
	return a.buildState(nil)
}

func (a *App) OpenProfilesFolder() error {
	root := a.profilesRoot(a.getSettings())
	if err := ensureDir(root); err != nil {
		return err
	}
	return openPath(root)
}

func (a *App) OpenUserDataFolder() error {
	return openPath(a.effectiveAppDataPath(a.getSettings()))
}

func (a *App) ChooseAppDataFolder() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:                "选择应用数据存储位置",
		CanCreateDirectories: true,
	})
}

func (a *App) OpenExternal(targetURL string) error {
	targetURL = strings.TrimSpace(targetURL)
	if !strings.HasPrefix(strings.ToLower(targetURL), "https://") {
		return errors.New("只能打开 HTTPS 链接。")
	}
	runtime.BrowserOpenURL(a.ctx, targetURL)
	return nil
}

func (a *App) SaveSettings(settings AppSettings) (*AppState, error) {
	current := a.getSettings()
	normalized := normalizeSettings(settings)
	if err := writeAppSettings(a.defaultAppDataPath, normalized); err != nil {
		return nil, err
	}

	if err := a.setLaunchAtStartup(normalized.LaunchAtStartup); err != nil {
		return nil, err
	}

	a.mu.Lock()
	a.settingsCache = normalized
	a.mu.Unlock()

	if normalized.DarkMode {
		runtime.WindowSetDarkTheme(a.ctx)
	} else {
		runtime.WindowSetLightTheme(a.ctx)
	}

	if current.AppDataPath != normalized.AppDataPath || current.ConfigTomlMode != normalized.ConfigTomlMode {
		a.clearCurrentUsageCache()
	}

	return a.buildState(nil)
}

type stateOverrides struct {
	ProfilesState *listProfilesResult
	Current       *StateSummary
	Profiles      []ProfileMetadata
	Runtime       *RuntimeSummary
}

func (a *App) buildState(overrides *stateOverrides) (*AppState, error) {
	settings := a.getSettings()
	tracked := getTrackedFilesForSettings(settings)

	var profilesState *listProfilesResult
	var runtimeSummary *RuntimeSummary
	var errProfiles error
	var errRuntime error

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		if overrides != nil && overrides.ProfilesState != nil {
			profilesState = overrides.ProfilesState
			return
		}
		profilesState, errProfiles = a.listProfiles(tracked)
	}()

	go func() {
		defer wg.Done()
		if overrides != nil && overrides.Runtime != nil {
			runtimeSummary = overrides.Runtime
			return
		}
		runtimeSummary, errRuntime = a.getRuntimeSummaryCached(false)
	}()

	wg.Wait()
	if errProfiles != nil {
		return nil, errProfiles
	}
	if errRuntime != nil {
		return nil, errRuntime
	}

	current := a.buildCurrentStateFromCache(profilesState.Current)
	if overrides != nil && overrides.Current != nil {
		current = *overrides.Current
	}

	profiles := profilesState.Profiles
	if overrides != nil && overrides.Profiles != nil {
		profiles = overrides.Profiles
	}

	resultProfiles := make([]ProfileMetadata, len(profiles))
	for index, profile := range profiles {
		profile.IsActive = current.IdentityKey != "" && profile.IdentityKey == current.IdentityKey
		resultProfiles[index] = profile
	}

	return &AppState{
		CodexHome:          a.codexHome,
		DefaultAppDataPath: a.defaultAppDataPath,
		AppDataPath:        a.effectiveAppDataPath(settings),
		AppVersion:         AppVersion,
		Settings:           settings,
		TrackedFiles:       append([]string(nil), tracked...),
		Runtime:            *runtimeSummary,
		Current:            current,
		Profiles:           resultProfiles,
	}, nil
}

func (a *App) getSettings() AppSettings {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.settingsCache
}

func (a *App) effectiveAppDataPath(settings AppSettings) string {
	if settings.AppDataPath != "" {
		return settings.AppDataPath
	}
	return a.defaultAppDataPath
}

func (a *App) profilesRoot(settings AppSettings) string {
	return filepath.Join(a.effectiveAppDataPath(settings), "profiles")
}

func (a *App) backupsRoot(settings AppSettings) string {
	return filepath.Join(a.effectiveAppDataPath(settings), "backups")
}

func (a *App) profileDir(profileID string) string {
	return filepath.Join(a.profilesRoot(a.getSettings()), profileID)
}

func (a *App) profileSnapshotDir(profileID string) string {
	return filepath.Join(a.profileDir(profileID), "snapshot")
}

func (a *App) listProfiles(tracked []string) (*listProfilesResult, error) {
	root := a.profilesRoot(a.getSettings())
	if err := ensureDir(root); err != nil {
		return nil, err
	}

	current, err := summarizeState(a.codexHome, tracked)
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}

	profiles := make([]ProfileMetadata, 0, len(entries))
	var mu sync.Mutex
	var wg sync.WaitGroup
	var firstErr error

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		wg.Add(1)
		go func(entry os.DirEntry) {
			defer wg.Done()

			metadata := ProfileMetadata{}
			err := readJSON(filepath.Join(root, entry.Name(), "metadata.json"), &metadata)
			if err != nil {
				if !errors.Is(err, os.ErrNotExist) {
					mu.Lock()
					if firstErr == nil {
						firstErr = err
					}
					mu.Unlock()
				}
				return
			}

			metadata.ID = entry.Name()
			if metadata.SortOrder < 0 {
				metadata.SortOrder = int(^uint(0) >> 1)
			}
			metadata.IsActive = metadata.IdentityKey != "" && metadata.IdentityKey == current.IdentityKey

			mu.Lock()
			profiles = append(profiles, metadata)
			mu.Unlock()
		}(entry)
	}

	wg.Wait()
	if firstErr != nil {
		return nil, firstErr
	}

	sort.SliceStable(profiles, func(i, j int) bool {
		if profiles[i].SortOrder != profiles[j].SortOrder {
			return profiles[i].SortOrder < profiles[j].SortOrder
		}
		return profiles[i].CreatedAt < profiles[j].CreatedAt
	})

	return &listProfilesResult{
		Current:  current,
		Profiles: profiles,
	}, nil
}

func (a *App) createProfileFromCurrent(name string, tracked []string) (*ProfileMetadata, error) {
	current, err := summarizeState(a.codexHome, tracked)
	if err != nil {
		return nil, err
	}
	if current.AuthMode == "" && current.APIKeyMasked == "" && len(current.TokenKeys) == 0 {
		return nil, errors.New("当前 Codex 尚未检测到可保存的登录状态。请先在 Codex 里登录目标账号。")
	}

	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		trimmedName = buildDefaultProfileName(current)
	}

	root := a.profilesRoot(a.getSettings())
	if err := ensureDir(root); err != nil {
		return nil, err
	}

	id, err := createUniqueProfileID(root, trimmedName)
	if err != nil {
		return nil, err
	}

	snapshotDir := filepath.Join(root, id, "snapshot")
	if err := copyTrackedFiles(a.codexHome, snapshotDir, tracked); err != nil {
		return nil, err
	}

	summary, err := summarizeState(snapshotDir, tracked)
	if err != nil {
		return nil, err
	}

	existing, err := a.listProfiles(tracked)
	if err != nil {
		return nil, err
	}

	metadata := buildMetadataFromSummary(id, trimmedName, summary, &ProfileMetadata{
		SortOrder: len(existing.Profiles),
	})
	if err := saveProfileMetadata(filepath.Join(root, id), metadata); err != nil {
		return nil, err
	}
	return &metadata, nil
}

func (a *App) createProfileFromAuth(profileBaseID string, auth AuthRecord, name string, tracked []string) (*ProfileMetadata, error) {
	root := a.profilesRoot(a.getSettings())
	if err := ensureDir(root); err != nil {
		return nil, err
	}

	id, err := createUniqueProfileID(root, profileBaseID)
	if err != nil {
		return nil, err
	}

	snapshotDir := filepath.Join(root, id, "snapshot")
	if err := copyTrackedFiles(a.codexHome, snapshotDir, tracked); err != nil {
		return nil, err
	}
	if err := writeAuthFile(snapshotDir, auth); err != nil {
		return nil, err
	}

	summary, err := summarizeState(snapshotDir, tracked)
	if err != nil {
		return nil, err
	}

	existing, err := a.listProfiles(tracked)
	if err != nil {
		return nil, err
	}

	metadata := buildMetadataFromSummary(id, firstNonEmpty(name, id), summary, &ProfileMetadata{
		SortOrder: len(existing.Profiles),
	})
	if err := saveProfileMetadata(filepath.Join(root, id), metadata); err != nil {
		return nil, err
	}
	return &metadata, nil
}

func (a *App) applyProfile(profileID string, tracked []string) (*ProfileMetadata, string, error) {
	profileDir := a.profileDir(profileID)
	snapshotDir := filepath.Join(profileDir, "snapshot")
	if !pathExists(snapshotDir) {
		return nil, "", errors.New("目标档案不存在。")
	}

	var metadata ProfileMetadata
	if err := readJSON(filepath.Join(profileDir, "metadata.json"), &metadata); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, "", errors.New("目标档案不存在。")
		}
		return nil, "", err
	}

	backupDir, err := a.backupCurrentState(tracked)
	if err != nil {
		return nil, "", err
	}
	if err := copyTrackedFiles(snapshotDir, a.codexHome, tracked); err != nil {
		return nil, "", err
	}

	summary, err := summarizeState(snapshotDir, tracked)
	if err != nil {
		return nil, "", err
	}
	updated := buildMetadataFromSummary(profileID, metadata.Name, summary, &metadata)
	if err := saveProfileMetadata(profileDir, updated); err != nil {
		return nil, "", err
	}

	return &updated, backupDir, nil
}

func (a *App) renameProfile(profileID, newName string) error {
	trimmed := strings.TrimSpace(newName)
	if trimmed == "" {
		return errors.New("新档案名不能为空。")
	}

	profileDir := a.profileDir(profileID)
	var metadata ProfileMetadata
	if err := readJSON(filepath.Join(profileDir, "metadata.json"), &metadata); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return errors.New("目标档案不存在。")
		}
		return err
	}

	metadata.ID = profileID
	metadata.Name = trimmed
	metadata.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return saveProfileMetadata(profileDir, metadata)
}

func (a *App) reorderProfiles(profileIDs []string) error {
	filtered := make([]string, 0, len(profileIDs))
	for _, profileID := range profileIDs {
		if trimmed := strings.TrimSpace(profileID); trimmed != "" {
			filtered = append(filtered, trimmed)
		}
	}
	if len(filtered) == 0 {
		return errors.New("排序列表不能为空。")
	}

	root := a.profilesRoot(a.getSettings())
	entries, err := os.ReadDir(root)
	if err != nil {
		return err
	}

	known := map[string]struct{}{}
	for _, entry := range entries {
		if entry.IsDir() {
			known[entry.Name()] = struct{}{}
		}
	}
	for _, profileID := range filtered {
		if _, ok := known[profileID]; !ok {
			return fmt.Errorf("档案不存在：%s", profileID)
		}
	}

	ordered := append([]string(nil), filtered...)
	for profileID := range known {
		if !containsString(filtered, profileID) {
			ordered = append(ordered, profileID)
		}
	}

	for index, profileID := range ordered {
		profileDir := filepath.Join(root, profileID)
		var metadata ProfileMetadata
		if err := readJSON(filepath.Join(profileDir, "metadata.json"), &metadata); err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return err
		}
		metadata.SortOrder = index
		if err := saveProfileMetadata(profileDir, metadata); err != nil {
			return err
		}
	}
	return nil
}

func (a *App) deleteProfile(profileID string) error {
	profileDir := a.profileDir(profileID)
	if !pathExists(profileDir) {
		return errors.New("目标档案不存在。")
	}
	return os.RemoveAll(profileDir)
}

func (a *App) backupCurrentState(tracked []string) (string, error) {
	root := a.backupsRoot(a.getSettings())
	if err := ensureDir(root); err != nil {
		return "", err
	}
	backupID := strings.NewReplacer(":", "-", ".", "-").Replace(time.Now().UTC().Format(time.RFC3339Nano))
	target := filepath.Join(root, backupID)
	if err := copyTrackedFiles(a.codexHome, target, tracked); err != nil {
		return "", err
	}
	return target, nil
}

func (a *App) enrichCurrentState(tracked []string) (StateSummary, error) {
	result, err := refreshAuthAndUsage(a.codexHome, true, tracked)
	if err != nil {
		return StateSummary{}, err
	}
	result.Summary.Usage = result.Usage
	result.Summary.UsageError = result.UsageError
	return result.Summary, nil
}

func (a *App) enrichProfiles(profiles []ProfileMetadata, force bool, tracked []string) ([]ProfileMetadata, error) {
	targets := make([]ProfileMetadata, 0, len(profiles))
	for _, profile := range profiles {
		if force || !hasFreshUsage(profile, usageCacheTTL) {
			targets = append(targets, profile)
		}
	}
	if len(targets) == 0 {
		return profiles, nil
	}

	refreshed := make(map[string]ProfileMetadata, len(targets))
	var mu sync.Mutex
	sem := make(chan struct{}, 2)
	var wg sync.WaitGroup
	var firstErr error

	for _, profile := range targets {
		wg.Add(1)
		go func(profile ProfileMetadata) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			updated, err := a.enrichProfile(profile, tracked)
			if err != nil {
				mu.Lock()
				if firstErr == nil {
					firstErr = err
				}
				mu.Unlock()
				return
			}

			mu.Lock()
			refreshed[profile.ID] = updated
			mu.Unlock()
		}(profile)
	}

	wg.Wait()
	if firstErr != nil {
		return nil, firstErr
	}

	result := make([]ProfileMetadata, len(profiles))
	for index, profile := range profiles {
		if updated, ok := refreshed[profile.ID]; ok {
			result[index] = updated
			continue
		}
		result[index] = profile
	}
	return result, nil
}

func (a *App) enrichProfile(profile ProfileMetadata, tracked []string) (ProfileMetadata, error) {
	result, err := refreshAuthAndUsage(a.profileSnapshotDir(profile.ID), true, tracked)
	if err != nil {
		return ProfileMetadata{}, err
	}

	profileDir := a.profileDir(profile.ID)
	var metadata ProfileMetadata
	if err := readJSON(filepath.Join(profileDir, "metadata.json"), &metadata); err != nil {
		return ProfileMetadata{}, err
	}
	metadata = mergeProfileSummary(metadata, result.Summary)
	if result.Usage != nil {
		metadata.Usage = result.Usage
		metadata.UsageUpdatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	metadata.UsageError = result.UsageError
	if err := saveProfileMetadata(profileDir, metadata); err != nil {
		return ProfileMetadata{}, err
	}
	return metadata, nil
}

type usageRefreshResult struct {
	Auth       AuthRecord
	Usage      *UsageSummary
	UsageError string
	Summary    StateSummary
}

func refreshAuthAndUsage(dir string, persistAuth bool, tracked []string) (*usageRefreshResult, error) {
	auth, err := readAuthFile(dir)
	if err != nil {
		return nil, err
	}
	if auth.AuthMode == "" && auth.OpenAIAPIKey == "" && auth.Tokens == nil {
		summary, sumErr := summarizeState(dir, tracked)
		if sumErr != nil {
			return nil, sumErr
		}
		return &usageRefreshResult{
			Auth:       auth,
			Usage:      nil,
			UsageError: "未找到 auth.json。",
			Summary:    summary,
		}, nil
	}

	if auth.AuthMode == "chatgpt" && auth.Tokens != nil && auth.Tokens.RefreshToken != "" {
		refreshed, refreshErr := refreshChatGPTAuth(auth)
		if refreshErr != nil {
			summary, sumErr := summarizeState(dir, tracked)
			if sumErr != nil {
				return nil, sumErr
			}
			return &usageRefreshResult{
				Auth:       auth,
				Usage:      nil,
				UsageError: refreshErr.Error(),
				Summary:    summary,
			}, nil
		}
		auth = refreshed
		if persistAuth {
			if err := writeAuthFile(dir, auth); err != nil {
				return nil, err
			}
		}
	}

	var usage *UsageSummary
	var usageErr string
	if auth.AuthMode == "chatgpt" && auth.Tokens != nil && auth.Tokens.AccessToken != "" {
		payload, err := fetchChatGPTUsage(auth.Tokens.AccessToken)
		if err != nil {
			usageErr = err.Error()
		} else {
			summarized := summarizeUsage(payload)
			usage = &summarized
		}
	}

	summary, err := summarizeState(dir, tracked)
	if err != nil {
		return nil, err
	}

	return &usageRefreshResult{
		Auth:       auth,
		Usage:      usage,
		UsageError: usageErr,
		Summary:    summary,
	}, nil
}

func summarizeState(dir string, tracked []string) (StateSummary, error) {
	auth, err := readAuthFile(dir)
	if err != nil {
		return StateSummary{}, err
	}
	fingerprint, err := computeFingerprint(dir, tracked)
	if err != nil {
		return StateSummary{}, err
	}

	identity := getAuthIdentity(auth)
	tokenKeys := make([]string, 0, 4)
	if auth.Tokens != nil {
		if auth.Tokens.IDToken != "" {
			tokenKeys = append(tokenKeys, "id_token")
		}
		if auth.Tokens.AccessToken != "" {
			tokenKeys = append(tokenKeys, "access_token")
		}
		if auth.Tokens.RefreshToken != "" {
			tokenKeys = append(tokenKeys, "refresh_token")
		}
		if auth.Tokens.AccountID != "" {
			tokenKeys = append(tokenKeys, "account_id")
		}
	}

	return StateSummary{
		AuthMode:     auth.AuthMode,
		LastRefresh:  auth.LastRefresh,
		APIKeyMasked: maskSecret(auth.OpenAIAPIKey),
		TokenKeys:    tokenKeys,
		Fingerprint:  fingerprint,
		IdentityKey:  identity.IdentityKey,
		AccountID:    identity.AccountID,
		UserID:       identity.UserID,
		Email:        identity.Email,
		PlanType:     identity.PlanType,
	}, nil
}

func buildDefaultProfileName(summary StateSummary) string {
	for _, candidate := range []string{summary.Email, summary.AccountID, summary.UserID, summary.PlanType} {
		if strings.TrimSpace(candidate) != "" {
			return strings.TrimSpace(candidate)
		}
	}

	return "profile-" + strings.NewReplacer("T", "-", ":", "-", "Z", "").Replace(time.Now().UTC().Format(time.RFC3339))
}

func buildMetadataFromSummary(id, name string, summary StateSummary, previous *ProfileMetadata) ProfileMetadata {
	now := time.Now().UTC().Format(time.RFC3339)
	result := ProfileMetadata{
		ID:           id,
		Name:         name,
		CreatedAt:    now,
		UpdatedAt:    now,
		SortOrder:    0,
		AuthMode:     summary.AuthMode,
		LastRefresh:  summary.LastRefresh,
		APIKeyMasked: summary.APIKeyMasked,
		TokenKeys:    summary.TokenKeys,
		Fingerprint:  summary.Fingerprint,
		IdentityKey:  summary.IdentityKey,
		AccountID:    summary.AccountID,
		UserID:       summary.UserID,
		Email:        summary.Email,
		PlanType:     summary.PlanType,
	}
	if previous != nil {
		if previous.CreatedAt != "" {
			result.CreatedAt = previous.CreatedAt
		}
		result.SortOrder = previous.SortOrder
		result.Usage = previous.Usage
		result.UsageError = previous.UsageError
		result.UsageUpdatedAt = previous.UsageUpdatedAt
	}
	return result
}

func mergeProfileSummary(metadata ProfileMetadata, summary StateSummary) ProfileMetadata {
	updated := metadata
	updated.AuthMode = summary.AuthMode
	updated.LastRefresh = summary.LastRefresh
	updated.APIKeyMasked = summary.APIKeyMasked
	updated.TokenKeys = summary.TokenKeys
	updated.Fingerprint = summary.Fingerprint
	updated.IdentityKey = summary.IdentityKey
	updated.AccountID = summary.AccountID
	updated.UserID = summary.UserID
	updated.Email = summary.Email
	updated.PlanType = summary.PlanType
	return updated
}

func saveProfileMetadata(profileDir string, metadata ProfileMetadata) error {
	if err := ensureDir(profileDir); err != nil {
		return err
	}
	return writeJSON(filepath.Join(profileDir, "metadata.json"), metadata)
}

func createUniqueProfileID(root, name string) (string, error) {
	base := slugify(name)
	if base == "" {
		base = fmt.Sprintf("profile-%d", time.Now().UnixMilli())
	}

	candidate := base
	counter := 2
	for pathExists(filepath.Join(root, candidate)) {
		candidate = fmt.Sprintf("%s-%d", base, counter)
		counter++
	}
	return candidate, nil
}

func slugify(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = slugPattern.ReplaceAllString(value, "-")
	value = strings.Trim(value, "-")
	if len(value) > 64 {
		value = value[:64]
	}
	return value
}

func copyTrackedFiles(sourceDir, targetDir string, tracked []string) error {
	if err := ensureDir(targetDir); err != nil {
		return err
	}

	for _, relativePath := range tracked {
		fromPath := filepath.Join(sourceDir, relativePath)
		toPath := filepath.Join(targetDir, relativePath)
		if pathExists(fromPath) {
			if err := ensureDir(filepath.Dir(toPath)); err != nil {
				return err
			}
			if err := copyFile(fromPath, toPath); err != nil {
				return err
			}
			continue
		}
		_ = os.Remove(toPath)
	}
	return nil
}

func computeFingerprint(dir string, tracked []string) (string, error) {
	hash := sha256.New()
	for _, relativePath := range tracked {
		hash.Write([]byte("FILE:" + relativePath + "\n"))
		content, err := os.ReadFile(filepath.Join(dir, relativePath))
		if err == nil {
			hash.Write(content)
		} else if errors.Is(err, os.ErrNotExist) {
			hash.Write([]byte("MISSING"))
		} else {
			return "", err
		}
		hash.Write([]byte("\n"))
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func defaultAppSettings() AppSettings {
	return AppSettings{
		Language:        "zh-CN",
		LaunchAtStartup: false,
		DarkMode:        false,
		CloseBehavior:   "quit",
		AppDataPath:     "",
		ConfigTomlMode:  "per-account",
	}
}

func normalizeSettings(settings AppSettings) AppSettings {
	result := defaultAppSettings()
	switch settings.Language {
	case "zh-CN", "zh-TW", "en-US", "fr-FR", "de-DE", "ja-JP", "ko-KR":
		result.Language = settings.Language
	}
	result.LaunchAtStartup = settings.LaunchAtStartup
	result.DarkMode = settings.DarkMode
	if settings.CloseBehavior == "background" {
		result.CloseBehavior = "background"
	}
	if filepath.IsAbs(settings.AppDataPath) {
		result.AppDataPath = settings.AppDataPath
	}
	if settings.ConfigTomlMode == "shared" {
		result.ConfigTomlMode = "shared"
	}
	return result
}

func readAppSettings(userDataPath string) (AppSettings, error) {
	settingsPath := filepath.Join(userDataPath, "app-settings.json")
	if !pathExists(settingsPath) {
		return defaultAppSettings(), nil
	}
	var settings AppSettings
	if err := readJSON(settingsPath, &settings); err != nil {
		return defaultAppSettings(), nil
	}
	return normalizeSettings(settings), nil
}

func writeAppSettings(userDataPath string, settings AppSettings) error {
	if err := ensureDir(userDataPath); err != nil {
		return err
	}
	return writeJSON(filepath.Join(userDataPath, "app-settings.json"), normalizeSettings(settings))
}

func getTrackedFilesForSettings(settings AppSettings) []string {
	normalized := normalizeSettings(settings)
	if normalized.ConfigTomlMode != "shared" {
		return append([]string(nil), trackedFiles...)
	}

	result := make([]string, 0, len(trackedFiles)-1)
	for _, trackedFile := range trackedFiles {
		if trackedFile != "config.toml" {
			result = append(result, trackedFile)
		}
	}
	return result
}

func detectDefaultAppDataPath() string {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return filepath.Join(".", ".xint-codex-account-switcher")
	}

	legacy := filepath.Join(configDir, "codex-account-switcher")
	modern := filepath.Join(configDir, AppTitle)
	switch {
	case pathExists(filepath.Join(legacy, "app-settings.json")):
		return legacy
	case pathExists(filepath.Join(modern, "app-settings.json")):
		return modern
	case pathExists(legacy):
		return legacy
	default:
		return legacy
	}
}

func readAuthFile(dir string) (AuthRecord, error) {
	path := filepath.Join(dir, "auth.json")
	if !pathExists(path) {
		return AuthRecord{}, nil
	}
	var record AuthRecord
	if err := readJSON(path, &record); err != nil {
		return AuthRecord{}, err
	}
	return record, nil
}

func readAuthFileByPath(path string) (AuthRecord, error) {
	var record AuthRecord
	if err := readJSON(path, &record); err != nil {
		return AuthRecord{}, err
	}
	return record, nil
}

func writeAuthFile(dir string, auth AuthRecord) error {
	if err := ensureDir(dir); err != nil {
		return err
	}
	return writeJSON(filepath.Join(dir, "auth.json"), auth)
}

func maskSecret(value string) string {
	if value == "" {
		return ""
	}
	if len(value) <= 8 {
		return value[:minInt(2, len(value))] + "***" + value[maxInt(0, len(value)-2):]
	}
	return value[:4] + "***" + value[len(value)-4:]
}

func getAuthIdentity(auth AuthRecord) authIdentity {
	if auth.AuthMode == "chatgpt" {
		return parseChatGPTIdentity(auth)
	}
	if auth.OpenAIAPIKey != "" {
		return authIdentity{
			IdentityKey: "apikey:" + sha256Hex(auth.OpenAIAPIKey),
			ClientID:    defaultOAuthClientID,
		}
	}
	return authIdentity{ClientID: defaultOAuthClientID}
}

func parseChatGPTIdentity(auth AuthRecord) authIdentity {
	accessPayload := decodeJWTPayload(tokenValue(auth.Tokens, "access"))
	idPayload := decodeJWTPayload(tokenValue(auth.Tokens, "id"))
	authClaim := mapClaim(asMap(accessPayload["https://api.openai.com/auth"]), asMap(idPayload["https://api.openai.com/auth"]))
	profileClaim := mapClaim(asMap(accessPayload["https://api.openai.com/profile"]), asMap(idPayload["https://api.openai.com/profile"]))

	accountID := firstNonEmpty(tokenValue(auth.Tokens, "account"), stringValue(authClaim, "chatgpt_account_id"))
	userID := firstNonEmpty(stringValue(authClaim, "chatgpt_user_id"), stringValue(authClaim, "user_id"))
	email := firstNonEmpty(stringValue(profileClaim, "email"), stringValue(idPayload, "email"))
	planType := stringValue(authClaim, "chatgpt_plan_type")
	clientID := firstNonEmpty(stringValue(accessPayload, "client_id"), defaultOAuthClientID)
	anchor := firstNonEmpty(accountID, userID, email)

	identityKey := ""
	if anchor != "" {
		identityKey = "chatgpt:" + anchor
	}

	return authIdentity{
		IdentityKey: identityKey,
		AccountID:   accountID,
		UserID:      userID,
		Email:       email,
		PlanType:    planType,
		ClientID:    clientID,
	}
}

func decodeJWTPayload(token string) map[string]any {
	if token == "" {
		return nil
	}
	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return nil
	}
	decoded, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil
	}
	var payload map[string]any
	if err := json.Unmarshal(decoded, &payload); err != nil {
		return nil
	}
	return payload
}

func buildChatGPTAuthRecord(tokens oauthTokenResponse) AuthRecord {
	accessPayload := decodeJWTPayload(tokens.AccessToken)
	authClaim := asMap(accessPayload["https://api.openai.com/auth"])
	accountID := firstNonEmpty(tokens.AccountID, stringValue(authClaim, "chatgpt_account_id"))

	return AuthRecord{
		AuthMode: "chatgpt",
		Tokens: &AuthTokens{
			IDToken:      tokens.IDToken,
			AccessToken:  tokens.AccessToken,
			RefreshToken: tokens.RefreshToken,
			AccountID:    accountID,
		},
		LastRefresh: time.Now().UTC().Format(time.RFC3339),
	}
}

func refreshChatGPTAuth(auth AuthRecord) (AuthRecord, error) {
	if auth.AuthMode != "chatgpt" || auth.Tokens == nil || auth.Tokens.RefreshToken == "" {
		return auth, nil
	}

	clientID := getAuthIdentity(auth).ClientID
	form := url.Values{
		"grant_type":    {"refresh_token"},
		"client_id":     {clientID},
		"refresh_token": {auth.Tokens.RefreshToken},
	}

	body, status, err := doHTTPText("POST", oauthTokenEndpoint, form.Encode(), map[string]string{
		"content-type": "application/x-www-form-urlencoded",
	})
	if err != nil {
		return AuthRecord{}, err
	}
	if status < 200 || status >= 300 {
		return AuthRecord{}, fmt.Errorf("刷新 ChatGPT 账号令牌失败，状态码 %d", status)
	}

	var response oauthTokenResponse
	if err := json.Unmarshal([]byte(body), &response); err != nil {
		return AuthRecord{}, err
	}
	if response.RefreshToken == "" && auth.Tokens != nil {
		response.RefreshToken = auth.Tokens.RefreshToken
	}
	if response.AccountID == "" && auth.Tokens != nil {
		response.AccountID = auth.Tokens.AccountID
	}
	return buildChatGPTAuthRecord(response), nil
}

func fetchChatGPTUsage(accessToken string) (usagePayload, error) {
	body, status, err := doHTTPText("GET", chatGPTUsageEndpoint, "", map[string]string{
		"Authorization": "Bearer " + accessToken,
		"Accept":        "application/json",
	})
	if err != nil {
		return usagePayload{}, err
	}
	if status < 200 || status >= 300 {
		return usagePayload{}, fmt.Errorf("读取 ChatGPT/Codex 额度失败，状态码 %d", status)
	}

	var payload usagePayload
	if err := json.Unmarshal([]byte(body), &payload); err != nil {
		return usagePayload{}, err
	}
	return payload, nil
}

func summarizeUsage(payload usagePayload) UsageSummary {
	allWindows := collectUsageWindows(payload)
	shortWindows := make([]UsageWindow, 0, len(allWindows))
	longWindows := make([]UsageWindow, 0, len(allWindows))
	for _, item := range allWindows {
		if item.WindowMinutes < 24*60 {
			shortWindows = append(shortWindows, item)
		} else {
			longWindows = append(longWindows, item)
		}
	}

	return UsageSummary{
		AccountID: payload.AccountID,
		Email:     payload.Email,
		PlanType:  payload.PlanType,
		FiveHour:  pickClosestWindow(shortWindows, 300),
		Weekly:    pickClosestWindow(longWindows, 7*24*60),
	}
}

func collectUsageWindows(payload usagePayload) []UsageWindow {
	result := []UsageWindow{}
	appendWindow := func(limitName string, window *usageWindow) {
		if window == nil || window.LimitWindowSecond == 0 {
			return
		}
		remaining := 100.0
		if window.UsedPercent != 0 {
			remaining = clamp(100-window.UsedPercent, 0, 100)
		}
		result = append(result, UsageWindow{
			LimitName:        limitName,
			UsedPercent:      window.UsedPercent,
			RemainingPercent: remaining,
			WindowMinutes:    window.LimitWindowSecond / 60,
			ResetsAt:         window.ResetAt,
		})
	}

	appendWindow("", payload.RateLimit.PrimaryWindow)
	appendWindow("", payload.RateLimit.SecondaryWindow)
	for _, item := range payload.AdditionalRateLimits {
		appendWindow(item.LimitName, item.RateLimit.PrimaryWindow)
		appendWindow(item.LimitName, item.RateLimit.SecondaryWindow)
	}
	return result
}

func pickClosestWindow(windows []UsageWindow, targetMinutes float64) *UsageWindow {
	if len(windows) == 0 {
		return nil
	}

	best := windows[0]
	bestDelta := absFloat(best.WindowMinutes - targetMinutes)
	for _, candidate := range windows[1:] {
		candidateDelta := absFloat(candidate.WindowMinutes - targetMinutes)
		if candidateDelta < bestDelta || (candidateDelta == bestDelta && candidate.WindowMinutes > best.WindowMinutes) {
			best = candidate
			bestDelta = candidateDelta
		}
	}
	return &best
}

func hasFreshUsage(profile ProfileMetadata, ttl time.Duration) bool {
	if profile.UsageUpdatedAt == "" {
		return false
	}
	timestamp, err := time.Parse(time.RFC3339, profile.UsageUpdatedAt)
	if err != nil {
		return false
	}
	return time.Since(timestamp) < ttl
}

func (a *App) buildCurrentStateFromCache(summary StateSummary) StateSummary {
	a.mu.Lock()
	cache := a.currentUsageCache
	a.mu.Unlock()
	if cache != nil && cache.IdentityKey != "" && cache.IdentityKey == summary.IdentityKey {
		summary.Usage = cache.Usage
		summary.UsageError = cache.UsageError
		summary.PlanType = firstNonEmpty(cache.PlanType, summary.PlanType)
		summary.AccountID = firstNonEmpty(cache.AccountID, summary.AccountID)
		summary.Email = firstNonEmpty(cache.Email, summary.Email)
	}
	return summary
}

func (a *App) updateCurrentUsageCache(current StateSummary) {
	a.mu.Lock()
	defer a.mu.Unlock()

	var usage *UsageSummary
	if current.Usage != nil {
		value := *current.Usage
		usage = &value
	}
	a.currentUsageCache = &currentUsageCache{
		IdentityKey: current.IdentityKey,
		Usage:       usage,
		UsageError:  current.UsageError,
		PlanType:    current.PlanType,
		AccountID:   current.AccountID,
		Email:       current.Email,
		UpdatedAt:   time.Now(),
	}
}

func (a *App) clearCurrentUsageCache() {
	a.mu.Lock()
	a.currentUsageCache = nil
	a.mu.Unlock()
}

func (a *App) invalidateRuntimeCache() {
	a.mu.Lock()
	a.runtimeCache = cachedRuntimeSummary{}
	a.mu.Unlock()
}

func (a *App) getRuntimeSummaryCached(force bool) (*RuntimeSummary, error) {
	a.mu.Lock()
	cached := a.runtimeCache
	a.mu.Unlock()

	if !force && cached.Value != nil && time.Since(cached.FetchedAt) < runtimeCacheTTL {
		value := *cached.Value
		return &value, nil
	}

	runtimeSummary, err := a.getCodexRuntimeSummary()
	if err != nil {
		return nil, err
	}

	a.mu.Lock()
	a.runtimeCache = cachedRuntimeSummary{
		Value:     runtimeSummary,
		FetchedAt: time.Now(),
	}
	a.mu.Unlock()
	return runtimeSummary, nil
}

func (a *App) getRunningCodexProcesses() ([]RuntimeProcess, error) {
	output, err := runPowerShell(`
    $items = Get-Process |
      Where-Object { $_.ProcessName -match '^(Codex|codex)$' } |
      Select-Object ProcessName, Id, Path
    $items | ConvertTo-Json
  `)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(output) == "" {
		return []RuntimeProcess{}, nil
	}

	var processes []RuntimeProcess
	if strings.HasPrefix(strings.TrimSpace(output), "[") {
		if err := json.Unmarshal([]byte(output), &processes); err != nil {
			return nil, err
		}
		return processes, nil
	}

	var single RuntimeProcess
	if err := json.Unmarshal([]byte(output), &single); err != nil {
		return nil, err
	}
	return []RuntimeProcess{single}, nil
}

func (a *App) stopCodexProcesses() error {
	_, err := runPowerShell(`
    Get-Process |
      Where-Object { $_.ProcessName -match '^(Codex|codex)$' } |
      Stop-Process -Force -ErrorAction SilentlyContinue
  `)
	return err
}

func (a *App) resolveAppxLaunchTarget() (*LaunchTarget, error) {
	a.mu.Lock()
	cached := a.appxLaunchCache
	a.mu.Unlock()

	if cached.Value != nil && time.Since(cached.FetchedAt) < appxCacheTTL {
		value := *cached.Value
		return &value, nil
	}

	output, err := runPowerShell(`
    $pkg = Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1 InstallLocation, PackageFamilyName
    if ($pkg) { $pkg | ConvertTo-Json }
  `)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(output) == "" {
		return nil, nil
	}

	var pkg struct {
		InstallLocation   string `json:"InstallLocation"`
		PackageFamilyName string `json:"PackageFamilyName"`
	}
	if err := json.Unmarshal([]byte(output), &pkg); err != nil {
		return nil, err
	}

	var target *LaunchTarget
	exePath := filepath.Join(pkg.InstallLocation, "app", "Codex.exe")
	if pathExists(exePath) {
		target = &LaunchTarget{Kind: "path", Target: exePath}
	} else if pkg.PackageFamilyName != "" {
		target = &LaunchTarget{Kind: "appx", Target: "shell:AppsFolder\\" + pkg.PackageFamilyName + "!App"}
	}

	a.mu.Lock()
	a.appxLaunchCache = cachedLaunchTarget{
		Value:     target,
		FetchedAt: time.Now(),
	}
	a.mu.Unlock()
	return target, nil
}

func (a *App) resolveLaunchTarget(running []RuntimeProcess) (*LaunchTarget, error) {
	for _, process := range running {
		if strings.HasSuffix(strings.ToLower(process.Path), "codex.exe") {
			return &LaunchTarget{Kind: "path", Target: process.Path}, nil
		}
	}
	return a.resolveAppxLaunchTarget()
}

func (a *App) launchCodex() (*LaunchTarget, error) {
	processes, err := a.getRunningCodexProcesses()
	if err != nil {
		return nil, err
	}
	target, err := a.resolveLaunchTarget(processes)
	if err != nil {
		return nil, err
	}
	if target == nil {
		return nil, errors.New("未找到 Codex 启动入口。")
	}

	switch target.Kind {
	case "path":
		if _, err := runPowerShell(fmt.Sprintf("Start-Process -FilePath '%s'", escapePowerShellLiteral(target.Target))); err != nil {
			return nil, err
		}
	default:
		if _, err := runPowerShell(fmt.Sprintf("Start-Process '%s'", escapePowerShellLiteral(target.Target))); err != nil {
			return nil, err
		}
	}
	return target, nil
}

func (a *App) getCodexRuntimeSummary() (*RuntimeSummary, error) {
	running, err := a.getRunningCodexProcesses()
	if err != nil {
		return nil, err
	}
	target, err := a.resolveLaunchTarget(running)
	if err != nil {
		return nil, err
	}

	return &RuntimeSummary{
		RunningCount: len(running),
		Running:      running,
		LaunchTarget: target,
	}, nil
}

func (a *App) resolveOAuthClientID() (string, error) {
	auth, err := readAuthFile(a.codexHome)
	if err != nil {
		return "", err
	}
	identity := getAuthIdentity(auth)
	if identity.ClientID != "" {
		return identity.ClientID, nil
	}
	return defaultOAuthClientID, nil
}

func (a *App) runDesktopOAuthFlow(flowCtx context.Context, clientID string) (oauthTokenResponse, error) {
	verifier, challenge, err := createPKCEPair()
	if err != nil {
		return oauthTokenResponse{}, err
	}
	state, err := randomBase64URL(16)
	if err != nil {
		return oauthTokenResponse{}, err
	}

	codeCtx, cancel := context.WithTimeout(flowCtx, oauthTimeout)
	defer cancel()

	waiter, err := startAuthorizationCallbackServer(state)
	if err != nil {
		return oauthTokenResponse{}, err
	}
	defer waiter.Close()

	rawAuthorizeURL := buildRawAuthorizeURL(clientID, waiter.redirectURI, challenge, state)
	desktopAuthURL := buildDesktopAuthURL(rawAuthorizeURL)
	runtime.BrowserOpenURL(a.ctx, desktopAuthURL)

	code, err := waiter.Wait(codeCtx)
	if err != nil {
		return oauthTokenResponse{}, err
	}

	return exchangeAuthorizationCode(codeCtx, code, verifier, waiter.redirectURI, clientID)
}

func createPKCEPair() (string, string, error) {
	verifier, err := randomBase64URL(32)
	if err != nil {
		return "", "", err
	}
	challengeRaw := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(challengeRaw[:])
	return verifier, challenge, nil
}

func buildRawAuthorizeURL(clientID, redirectURI, challenge, state string) string {
	values := url.Values{
		"response_type":             {"code"},
		"client_id":                 {clientID},
		"redirect_uri":              {redirectURI},
		"scope":                     {"openid profile email offline_access"},
		"audience":                  {"https://api.openai.com/v1"},
		"code_challenge":            {challenge},
		"code_challenge_method":     {"S256"},
		"state":                     {state},
		"originator":                {"Codex Desktop"},
		"prompt":                    {"login"},
		"max_age":                   {"0"},
		"codex_cli_simplified_flow": {"true"},
	}
	return oauthAuthorizeBase + "/oauth/authorize?" + values.Encode()
}

func buildDesktopAuthURL(rawAuthorizeURL string) string {
	target, _ := url.Parse(chatGPTDesktopAuthURL)
	query := target.Query()
	query.Set("authorize_url", rawAuthorizeURL)
	query.Set("codex_streamlined_login", "true")
	target.RawQuery = query.Encode()
	return target.String()
}

func startAuthorizationCallbackServer(expectedState string) (*authCodeWaiter, error) {
	listener, err := net.Listen("tcp", fmt.Sprintf("%s:%d", callbackHost, callbackPort))
	if err != nil {
		return nil, err
	}

	resultCh := make(chan authCodeResult, 1)

	server := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			requestURL := r.URL
			if requestURL.Path != callbackPath {
				http.NotFound(w, r)
				return
			}

			if requestURL.Query().Get("state") != expectedState {
				http.Error(w, "State mismatch", http.StatusBadRequest)
				select {
				case resultCh <- authCodeResult{err: errors.New("网页登录校验失败。")}:
				default:
				}
				return
			}

			if oauthErr := requestURL.Query().Get("error"); oauthErr != "" {
				description := requestURL.Query().Get("error_description")
				http.Error(w, "OAuth failed", http.StatusBadRequest)
				select {
				case resultCh <- authCodeResult{err: errors.New(firstNonEmpty(description, oauthErr))}:
				default:
				}
				return
			}

			code := requestURL.Query().Get("code")
			if code == "" {
				http.Error(w, "Missing authorization code", http.StatusBadRequest)
				select {
				case resultCh <- authCodeResult{err: errors.New("缺少 OAuth 授权码。")}:
				default:
				}
				return
			}

			w.Header().Set("content-type", "text/html; charset=utf-8")
			_, _ = io.WriteString(w, "<html><body>Codex 账号授权完成，可以回到切换器。</body></html>")
			select {
			case resultCh <- authCodeResult{code: code}:
			default:
			}
		}),
	}

	go func() {
		_ = server.Serve(listener)
	}()

	return &authCodeWaiter{
		server:      server,
		listener:    listener,
		resultCh:    resultCh,
		redirectURI: fmt.Sprintf("http://localhost:%d%s", callbackPort, callbackPath),
	}, nil
}

func (w *authCodeWaiter) Wait(ctx context.Context) (string, error) {
	select {
	case <-ctx.Done():
		if errors.Is(ctx.Err(), context.Canceled) {
			return "", errors.New("网页登录已取消。")
		}
		return "", errors.New("网页 OAuth 登录超时，请重试。")
	case result := <-w.resultCh:
		return result.code, result.err
	}
}

func (w *authCodeWaiter) Close() {
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = w.server.Shutdown(shutdownCtx)
}

func exchangeAuthorizationCode(ctx context.Context, code, verifier, redirectURI, clientID string) (oauthTokenResponse, error) {
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {redirectURI},
		"client_id":     {clientID},
		"code_verifier": {verifier},
	}

	body, status, err := doHTTPTextWithContext(ctx, "POST", oauthTokenEndpoint, form.Encode(), map[string]string{
		"content-type": "application/x-www-form-urlencoded",
	})
	if err != nil {
		return oauthTokenResponse{}, err
	}
	if status < 200 || status >= 300 {
		detail := strings.TrimSpace(body)
		if len(detail) > 200 {
			detail = detail[:200]
		}
		if detail != "" {
			return oauthTokenResponse{}, fmt.Errorf("OAuth 令牌交换失败，状态码 %d，响应：%s", status, detail)
		}
		return oauthTokenResponse{}, fmt.Errorf("OAuth 令牌交换失败，状态码 %d", status)
	}

	var tokens oauthTokenResponse
	if err := json.Unmarshal([]byte(body), &tokens); err != nil {
		return oauthTokenResponse{}, err
	}
	return tokens, nil
}

func (a *App) setLaunchAtStartup(enabled bool) error {
	exePath, err := os.Executable()
	if err != nil {
		return err
	}

	key, _, err := registry.CreateKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Run`, registry.SET_VALUE|registry.QUERY_VALUE)
	if err != nil {
		return err
	}
	defer key.Close()

	const valueName = "XinT Codex Account Switcher"
	if enabled {
		return key.SetStringValue(valueName, fmt.Sprintf(`"%s"`, exePath))
	}

	if err := key.DeleteValue(valueName); err != nil && !errors.Is(err, registry.ErrNotExist) {
		return err
	}
	return nil
}

func runPowerShell(command string) (string, error) {
	cmd := exec.Command("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("%s", strings.TrimSpace(string(output)))
	}
	return strings.TrimSpace(string(output)), nil
}

func openPath(target string) error {
	target = strings.TrimSpace(target)
	if target == "" {
		return errors.New("路径不能为空。")
	}
	cmd := exec.Command("explorer", target)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Start()
}

func doHTTPText(method, targetURL, body string, headers map[string]string) (string, int, error) {
	return doHTTPTextWithContext(context.Background(), method, targetURL, body, headers)
}

func doHTTPTextWithContext(ctx context.Context, method, targetURL, body string, headers map[string]string) (string, int, error) {
	requestCtx, cancel := context.WithTimeout(ctx, fetchTimeout)
	defer cancel()

	request, err := http.NewRequestWithContext(requestCtx, method, targetURL, strings.NewReader(body))
	if err != nil {
		return "", 0, err
	}
	for key, value := range headers {
		request.Header.Set(key, value)
	}

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		if errors.Is(requestCtx.Err(), context.DeadlineExceeded) {
			return "", 408, fmt.Errorf("请求超时（>%dms）", fetchTimeout.Milliseconds())
		}
		return "", 0, err
	}
	defer response.Body.Close()

	payload, err := io.ReadAll(response.Body)
	if err != nil {
		return "", response.StatusCode, err
	}
	return string(payload), response.StatusCode, nil
}

func readJSON(path string, target any) error {
	content, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(content, target)
}

func writeJSON(path string, value any) error {
	content, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	content = append(content, '\n')
	return os.WriteFile(path, content, 0o644)
}

func copyFile(fromPath, toPath string) error {
	if err := ensureDir(filepath.Dir(toPath)); err != nil {
		return err
	}
	source, err := os.Open(fromPath)
	if err != nil {
		return err
	}
	defer source.Close()

	target, err := os.Create(toPath)
	if err != nil {
		return err
	}
	defer target.Close()

	if _, err := io.Copy(target, source); err != nil {
		return err
	}
	return target.Close()
}

func ensureDir(dir string) error {
	return os.MkdirAll(dir, 0o755)
}

func pathExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func randomBase64URL(byteLength int) (string, error) {
	buffer := make([]byte, byteLength)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

func tokenValue(tokens *AuthTokens, kind string) string {
	if tokens == nil {
		return ""
	}
	switch kind {
	case "access":
		return tokens.AccessToken
	case "id":
		return tokens.IDToken
	case "refresh":
		return tokens.RefreshToken
	case "account":
		return tokens.AccountID
	default:
		return ""
	}
}

func firstMap(values ...map[string]any) map[string]any {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

func asMap(value any) map[string]any {
	if typed, ok := value.(map[string]any); ok {
		return typed
	}
	return nil
}

func mapClaim(values ...map[string]any) map[string]any {
	return firstMap(values...)
}

func stringValue(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	value, ok := m[key]
	if !ok {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return typed
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	default:
		return ""
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func containsString(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}

func sanitizeFileName(value string) string {
	replacer := regexp.MustCompile(`[<>:"/\\|?*\x00-\x1F]+`)
	value = replacer.ReplaceAllString(value, "-")
	value = strings.TrimSpace(value)
	if len(value) > 80 {
		value = value[:80]
	}
	if value == "" {
		return "auth"
	}
	return value
}

func escapePowerShellLiteral(value string) string {
	return strings.ReplaceAll(value, "'", "''")
}

func sha256Hex(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func clamp(value, minValue, maxValue float64) float64 {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func absFloat(value float64) float64 {
	if value < 0 {
		return -value
	}
	return value
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
