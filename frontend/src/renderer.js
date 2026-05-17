'use strict';

import './wails-bridge.js';
import './styles.css';

const state = {
  busy: false,
  busyMode: null,
  data: null,
  addMethod: 'oauth',
  theme: 'light',
  draggingProfileId: null,
  refreshingUsage: false,
  refreshRequestId: 0,
  activeFlashMessage: '',
  flashQueue: [],
  settingsSection: 'config',
  settingsDraft: null
};

const profilesEl = document.getElementById('profiles');
const flashEl = document.getElementById('flash');
const flashTextEl = document.getElementById('flashText');
const flashCloseBtnEl = document.getElementById('flashCloseBtn');
const runtimeBadgeEl = document.getElementById('runtimeBadge');
const themeToggleBtnEl = document.getElementById('themeToggleBtn');
const statusBtnEl = document.getElementById('statusBtn');
const restartCodexBtnEl = document.getElementById('restartCodexBtn');
const openProfilesBtnEl = document.getElementById('openProfilesBtn');
const refreshUsageBtnEl = document.getElementById('refreshUsageBtn');
const addAccountBtnEl = document.getElementById('addAccountBtn');
const profileCardTemplate = document.getElementById('profileCardTemplate');
const renameModalEl = document.getElementById('renameModal');
const renameFormEl = document.getElementById('renameForm');
const renameInputEl = document.getElementById('renameInput');
const addAccountModalEl = document.getElementById('addAccountModal');
const addMethodTitleEl = document.getElementById('addMethodTitle');
const addMethodDescriptionEl = document.getElementById('addMethodDescription');
const addMethodNoteEl = document.getElementById('addMethodNote');
const addMethodActionBtnEl = document.getElementById('addMethodActionBtn');
const currentStateModalEl = document.getElementById('currentStateModal');
const settingsContentEl = document.getElementById('settingsContent');
const oauthPendingModalEl = document.getElementById('oauthPendingModal');
const cancelOAuthBtnEl = document.getElementById('cancelOAuthBtn');
const THEME_STORAGE_KEY = 'xint-codex-switcher-theme';
const AUTO_REFRESH_INTERVAL_MS = 30 * 1000;
const GITHUB_URL = 'https://github.com/XinTycd/XinT-Codex-Account-Switcher';
const SUPPORTED_LANGUAGES = ['zh-CN', 'zh-TW', 'en-US', 'fr-FR', 'de-DE', 'ja-JP', 'ko-KR'];
const LANGUAGE_LABELS = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  'en-US': 'English',
  'fr-FR': 'Français',
  'de-DE': 'Deutsch',
  'ja-JP': '日本語',
  'ko-KR': '한국어'
};
const DEFAULT_RENDERER_SETTINGS = {
  language: 'zh-CN',
  launchAtStartup: false,
  darkMode: false,
  closeBehavior: 'quit',
  appDataPath: '',
  configTomlMode: 'per-account'
};

const I18N = {
  'zh-CN': {
    appTitle: 'XinT Codex Account Switcher',
    openSettings: '打开设置',
    settings: '设置',
    restartCodex: '重启 Codex',
    openProfilesFolder: '打开档案目录',
    switchToLight: '切换到浅色模式',
    switchToDark: '切换到深色模式',
    switchTheme: '切换主题',
    profilesTitle: '账号档案',
    refreshAllUsage: '刷新所有账号额度',
    addAccount: '添加账号',
    closeTip: '关闭提示',
    fiveHourQuota: '5 小时额度',
    weeklyQuota: '一周额度',
    switchAndLaunch: '切换并启动',
    downloadAuth: '下载 auth.json',
    rename: '重命名',
    delete: '删除',
    renameProfile: '重命名档案',
    renamePlaceholder: '输入新的档案名',
    cancel: '取消',
    save: '保存',
    start: '开始',
    addMethodTabsLabel: '添加账号方式',
    oauthLogin: '网页 OAuth 授权登录',
    saveCurrentProfile: '保存当前 Codex 档案',
    importAuth: '导入 auth.json',
    settingsCategories: '设置分类',
    config: '配置',
    status: '状态',
    about: '关于',
    close: '关闭',
    waitingOAuth: '等待网页登录授权',
    oauthPendingDescription: '浏览器已打开官方授权页面。完成登录后会自动回到切换器；如果不继续，可以直接取消本次授权。',
    cancelOAuth: '取消授权',
    oauthTitle: '网页 OAuth 授权登录',
    oauthDescription: '打开浏览器进入官方登录页。你完成授权后，切换器会自动接收回调并创建一个新的账号档案。',
    oauthNote: '适合直接添加全新的 ChatGPT / Codex 账号。授权等待期间会显示单独的状态弹窗，并允许你主动取消。',
    oauthAction: '开始网页授权',
    currentTitle: '保存当前 Codex 已登录档案',
    currentDescription: '直接读取本机当前 `~/.codex` 下的认证状态，把已经登录好的账号保存成新档案。',
    currentNote: '适合你已经在 Codex 客户端里完成登录，只需要把当前状态沉淀为一个可切换档案的场景。',
    currentAction: '保存当前登录',
    importTitle: '导入 auth.json',
    importDescription: '选择外部 `auth.json` 文件，切换器会解析认证信息并导入为新的账号档案。',
    importNote: '适合跨机器迁移账号、恢复备份，或者把其他环境里的认证状态拉进当前切换器。',
    importAction: '选择 auth.json',
    notProvided: '未提供',
    remaining: '剩余',
    resetTime: '重置时间',
    notDetected: '未检测到',
    unknown: '未知',
    codexConfigDir: 'Codex 配置文件目录',
    authMode: '认证模式',
    currentAccount: '当前账号',
    currentPlan: '当前套餐',
    runtimeStatus: '运行状态',
    codexRunning: 'Codex 正在运行',
    codexStopped: 'Codex 当前未运行',
    statusDescription: '当前 Codex 状态和账号运行信息。',
    configDescription: '控制应用行为、主题显示和 Codex 配置文件的使用范围。',
    language: '语言',
    languageDescription: '设置界面显示语言。',
    launchAtStartup: '开机启动',
    launchAtStartupDescription: '是否在 Windows 登录后自动启动切换器。',
    disabled: '关闭',
    enabled: '开启',
    darkMode: '深色模式',
    darkModeDescription: '设置应用是否使用深色主题。',
    light: '浅色',
    dark: '深色',
    closeBehavior: '关闭按钮行为',
    closeBehaviorDescription: '点击窗口关闭按钮时，选择后台运行或直接退出程序。',
    backgroundRun: '后台运行',
    quitApp: '关闭程序',
    appDataPath: '应用数据存储位置',
    configTomlStrategy: '配置文件 (config.toml) 切换策略',
    configTomlStrategyDescription: '选择 Codex 配置文件是所有账号共同使用，还是跟随账号档案切换。',
    shared: '共同使用',
    perAccount: '分帐号使用',
    currentTrackedFiles: '当前跟踪文件',
    choose: '选择',
    default: '默认',
    open: '打开',
    aboutDescription: '应用信息与项目地址。',
    programName: '程序名称',
    programVersion: '程序版本',
    author: '作者',
    githubUrl: 'Github 项目地址',
    emptyProfileTitle: '还没有账号档案',
    emptyProfileDescription: '点击右上角加号，可以通过网页 OAuth、保存当前 Codex 登录状态，或导入 auth.json 来添加账号。',
    usageReadFailed: '额度读取失败：{error}',
    reordered: '账号档案顺序已更新。',
    confirmSwitch: '切换到档案 "{name}" 时会先关闭 Codex，再写入此档案。继续吗？',
    switched: '已切换到档案 "{name}"。切换前状态已备份到：{path}',
    exportCancelled: '已取消导出 auth.json。',
    exportedAuth: '已导出 "{name}" 的 auth.json：{path}',
    confirmDelete: '确定删除档案 "{name}"？此操作不会影响当前已登录的 Codex，但会移除此档案快照。',
    deleted: '已删除档案 "{name}"。',
    refreshingUsage: '正在重新查询所有账号额度...',
    refreshedUsage: '所有账号额度已刷新。',
    oauthCreated: '新账号已加入档案列表。',
    oauthCancelled: '已取消网页授权。',
    currentProfileSaved: '已将当前 Codex 登录状态保存为新档案。',
    importCancelled: '已取消导入 auth.json。',
    importedAuth: '已从 auth.json 导入新账号。',
    codexRestarted: 'Codex 已重启。',
    renamed: '已将档案重命名为 "{name}"。',
    languages: {
      'zh-CN': '简体中文',
      'zh-TW': '繁體中文',
      'en-US': '英语',
      'fr-FR': '法语',
      'de-DE': '德语',
      'ja-JP': '日语',
      'ko-KR': '韩语'
    }
  },
  'zh-TW': {
    appTitle: 'XinT Codex Account Switcher',
    openSettings: '開啟設定',
    settings: '設定',
    restartCodex: '重新啟動 Codex',
    openProfilesFolder: '開啟檔案目錄',
    switchToLight: '切換到淺色模式',
    switchToDark: '切換到深色模式',
    switchTheme: '切換主題',
    profilesTitle: '帳號檔案',
    refreshAllUsage: '重新整理所有帳號額度',
    addAccount: '新增帳號',
    closeTip: '關閉提示',
    fiveHourQuota: '5 小時額度',
    weeklyQuota: '每週額度',
    switchAndLaunch: '切換並啟動',
    downloadAuth: '下載 auth.json',
    rename: '重新命名',
    delete: '刪除',
    renameProfile: '重新命名檔案',
    renamePlaceholder: '輸入新的檔案名稱',
    cancel: '取消',
    save: '儲存',
    start: '開始',
    addMethodTabsLabel: '新增帳號方式',
    oauthLogin: '網頁 OAuth 授權登入',
    saveCurrentProfile: '儲存目前 Codex 檔案',
    importAuth: '匯入 auth.json',
    settingsCategories: '設定分類',
    config: '配置',
    status: '狀態',
    about: '關於',
    close: '關閉',
    waitingOAuth: '等待網頁登入授權',
    oauthPendingDescription: '瀏覽器已開啟官方授權頁面。完成登入後會自動回到切換器；如果不繼續，可以直接取消本次授權。',
    cancelOAuth: '取消授權',
    oauthTitle: '網頁 OAuth 授權登入',
    oauthDescription: '開啟瀏覽器進入官方登入頁。完成授權後，切換器會自動接收回呼並建立新的帳號檔案。',
    oauthNote: '適合直接新增全新的 ChatGPT / Codex 帳號。等待授權期間會顯示獨立狀態視窗，並允許主動取消。',
    oauthAction: '開始網頁授權',
    currentTitle: '儲存目前 Codex 已登入檔案',
    currentDescription: '直接讀取本機目前 `~/.codex` 下的認證狀態，將已登入帳號儲存為新檔案。',
    currentNote: '適合已在 Codex 客戶端完成登入，只需要把目前狀態保存為可切換檔案的場景。',
    currentAction: '儲存目前登入',
    importTitle: '匯入 auth.json',
    importDescription: '選擇外部 `auth.json` 檔案，切換器會解析認證資訊並匯入為新的帳號檔案。',
    importNote: '適合跨機器遷移帳號、恢復備份，或把其他環境的認證狀態加入目前切換器。',
    importAction: '選擇 auth.json',
    notProvided: '未提供',
    remaining: '剩餘',
    resetTime: '重置時間',
    notDetected: '未偵測到',
    unknown: '未知',
    codexConfigDir: 'Codex 配置檔目錄',
    authMode: '認證模式',
    currentAccount: '目前帳號',
    currentPlan: '目前方案',
    runtimeStatus: '執行狀態',
    codexRunning: 'Codex 正在執行',
    codexStopped: 'Codex 目前未執行',
    statusDescription: '目前 Codex 狀態和帳號執行資訊。',
    configDescription: '控制應用行為、主題顯示和 Codex 配置檔使用範圍。',
    language: '語言',
    languageDescription: '設定介面顯示語言。',
    launchAtStartup: '開機啟動',
    launchAtStartupDescription: '是否在 Windows 登入後自動啟動切換器。',
    disabled: '關閉',
    enabled: '開啟',
    darkMode: '深色模式',
    darkModeDescription: '設定應用是否使用深色主題。',
    light: '淺色',
    dark: '深色',
    closeBehavior: '關閉按鈕行為',
    closeBehaviorDescription: '點擊視窗關閉按鈕時，選擇背景執行或直接結束程式。',
    backgroundRun: '背景執行',
    quitApp: '結束程式',
    appDataPath: '應用資料儲存位置',
    configTomlStrategy: '配置檔 (config.toml) 切換策略',
    configTomlStrategyDescription: '選擇 Codex 配置檔是所有帳號共用，還是跟隨帳號檔案切換。',
    shared: '共用',
    perAccount: '分帳號使用',
    currentTrackedFiles: '目前追蹤檔案',
    choose: '選擇',
    default: '預設',
    open: '開啟',
    aboutDescription: '應用資訊與專案地址。',
    programName: '程式名稱',
    programVersion: '程式版本',
    author: '作者',
    githubUrl: 'Github 專案地址',
    emptyProfileTitle: '尚未建立帳號檔案',
    emptyProfileDescription: '點擊右上角加號，可以透過網頁 OAuth、儲存目前 Codex 登入狀態，或匯入 auth.json 來新增帳號。',
    usageReadFailed: '額度讀取失敗：{error}',
    reordered: '帳號檔案順序已更新。',
    confirmSwitch: '切換到檔案「{name}」時會先關閉 Codex，再寫入此檔案。要繼續嗎？',
    switched: '已切換到檔案「{name}」。切換前狀態已備份到：{path}',
    exportCancelled: '已取消匯出 auth.json。',
    exportedAuth: '已匯出「{name}」的 auth.json：{path}',
    confirmDelete: '確定刪除檔案「{name}」？此操作不會影響目前已登入的 Codex，但會移除此檔案快照。',
    deleted: '已刪除檔案「{name}」。',
    refreshingUsage: '正在重新查詢所有帳號額度...',
    refreshedUsage: '所有帳號額度已重新整理。',
    oauthCreated: '新帳號已加入檔案列表。',
    oauthCancelled: '已取消網頁授權。',
    currentProfileSaved: '已將目前 Codex 登入狀態儲存為新檔案。',
    importCancelled: '已取消匯入 auth.json。',
    importedAuth: '已從 auth.json 匯入新帳號。',
    codexRestarted: 'Codex 已重新啟動。',
    renamed: '已將檔案重新命名為「{name}」。',
    languages: {
      'zh-CN': '简体中文',
      'zh-TW': '繁體中文',
      'en-US': '英語',
      'fr-FR': '法語',
      'de-DE': '德語',
      'ja-JP': '日語',
      'ko-KR': '韓語'
    }
  }
};

I18N['en-US'] = {
  ...I18N['zh-CN'],
  openSettings: 'Open Settings',
  settings: 'Settings',
  restartCodex: 'Restart Codex',
  openProfilesFolder: 'Open Profiles Folder',
  switchToLight: 'Switch to Light Mode',
  switchToDark: 'Switch to Dark Mode',
  switchTheme: 'Switch Theme',
  profilesTitle: 'Account Profiles',
  refreshAllUsage: 'Refresh all account quotas',
  addAccount: 'Add Account',
  closeTip: 'Close notice',
  fiveHourQuota: '5-hour quota',
  weeklyQuota: 'Weekly quota',
  switchAndLaunch: 'Switch and Launch',
  downloadAuth: 'Download auth.json',
  rename: 'Rename',
  delete: 'Delete',
  renameProfile: 'Rename Profile',
  renamePlaceholder: 'Enter a new profile name',
  cancel: 'Cancel',
  save: 'Save',
  start: 'Start',
  addMethodTabsLabel: 'Account add methods',
  oauthLogin: 'Web OAuth Login',
  saveCurrentProfile: 'Save Current Codex Profile',
  importAuth: 'Import auth.json',
  settingsCategories: 'Settings Categories',
  config: 'Configuration',
  status: 'Status',
  about: 'About',
  close: 'Close',
  waitingOAuth: 'Waiting for Web Authorization',
  oauthPendingDescription: 'The official authorization page has opened in your browser. After login, the switcher will return automatically. You can cancel this authorization if you do not want to continue.',
  cancelOAuth: 'Cancel Authorization',
  oauthTitle: 'Web OAuth Login',
  oauthDescription: 'Open the official login page in your browser. After authorization, the switcher receives the callback and creates a new account profile.',
  oauthNote: 'Use this to add a new ChatGPT / Codex account directly. A separate waiting dialog is shown during authorization and can be cancelled.',
  oauthAction: 'Start Web Authorization',
  currentTitle: 'Save Current Logged-in Codex Profile',
  currentDescription: 'Read the current authentication state from local `~/.codex` and save the logged-in account as a new profile.',
  currentNote: 'Use this when you have already logged in through the Codex client and only need to save the current state as a switchable profile.',
  currentAction: 'Save Current Login',
  importTitle: 'Import auth.json',
  importDescription: 'Choose an external `auth.json`; the switcher will parse it and import it as a new account profile.',
  importNote: 'Use this for account migration, backup restore, or importing authentication from another environment.',
  importAction: 'Choose auth.json',
  notProvided: 'Not provided',
  remaining: 'remaining',
  resetTime: 'Reset time',
  notDetected: 'Not detected',
  unknown: 'Unknown',
  codexConfigDir: 'Codex configuration directory',
  authMode: 'Auth mode',
  currentAccount: 'Current account',
  currentPlan: 'Current plan',
  runtimeStatus: 'Runtime status',
  codexRunning: 'Codex is running',
  codexStopped: 'Codex is not running',
  statusDescription: 'Current Codex status and account runtime information.',
  configDescription: 'Control app behavior, theme display, and Codex configuration scope.',
  language: 'Language',
  languageDescription: 'Set the interface display language.',
  launchAtStartup: 'Launch at startup',
  launchAtStartupDescription: 'Start the switcher automatically after Windows login.',
  disabled: 'Off',
  enabled: 'On',
  darkMode: 'Dark mode',
  darkModeDescription: 'Set whether the app uses the dark theme.',
  light: 'Light',
  dark: 'Dark',
  closeBehavior: 'Close button behavior',
  closeBehaviorDescription: 'Choose whether the window close button keeps the app in the background or quits it.',
  backgroundRun: 'Run in background',
  quitApp: 'Quit app',
  appDataPath: 'App data storage location',
  configTomlStrategy: 'Configuration file (config.toml) switch strategy',
  configTomlStrategyDescription: 'Choose whether the Codex configuration file is shared by all accounts or switches with each account profile.',
  shared: 'Shared',
  perAccount: 'Per account',
  currentTrackedFiles: 'Currently tracked files',
  choose: 'Choose',
  default: 'Default',
  open: 'Open',
  aboutDescription: 'Application information and project link.',
  programName: 'Program name',
  programVersion: 'Program version',
  author: 'Author',
  githubUrl: 'Github project URL',
  emptyProfileTitle: 'No account profiles yet',
  emptyProfileDescription: 'Click the plus button in the upper right to add an account through web OAuth, the current Codex login state, or auth.json import.',
  usageReadFailed: 'Quota read failed: {error}',
  reordered: 'Account profile order updated.',
  confirmSwitch: 'Switching to profile "{name}" will close Codex first and then write this profile. Continue?',
  switched: 'Switched to profile "{name}". Previous state was backed up to: {path}',
  exportCancelled: 'auth.json export cancelled.',
  exportedAuth: 'Exported auth.json for "{name}": {path}',
  confirmDelete: 'Delete profile "{name}"? This will not affect the currently logged-in Codex account, but it will remove this profile snapshot.',
  deleted: 'Deleted profile "{name}".',
  refreshingUsage: 'Refreshing all account quotas...',
  refreshedUsage: 'All account quotas refreshed.',
  oauthCreated: 'New account added to the profile list.',
  oauthCancelled: 'Web authorization cancelled.',
  currentProfileSaved: 'Current Codex login state saved as a new profile.',
  importCancelled: 'auth.json import cancelled.',
  importedAuth: 'New account imported from auth.json.',
  codexRestarted: 'Codex restarted.',
  renamed: 'Renamed profile to "{name}".',
  languages: {
    'zh-CN': 'Simplified Chinese',
    'zh-TW': 'Traditional Chinese',
    'en-US': 'English',
    'fr-FR': 'French',
    'de-DE': 'German',
    'ja-JP': 'Japanese',
    'ko-KR': 'Korean'
  }
};

I18N['fr-FR'] = {
  ...I18N['en-US'],
  openSettings: 'Ouvrir les paramètres',
  settings: 'Paramètres',
  restartCodex: 'Redémarrer Codex',
  openProfilesFolder: 'Ouvrir le dossier des profils',
  switchToLight: 'Passer en mode clair',
  switchToDark: 'Passer en mode sombre',
  switchTheme: 'Changer de thème',
  profilesTitle: 'Profils de compte',
  refreshAllUsage: 'Actualiser tous les quotas',
  addAccount: 'Ajouter un compte',
  closeTip: 'Fermer la notification',
  fiveHourQuota: 'Quota de 5 heures',
  weeklyQuota: 'Quota hebdomadaire',
  switchAndLaunch: 'Basculer et lancer',
  downloadAuth: 'Télécharger auth.json',
  rename: 'Renommer',
  delete: 'Supprimer',
  renameProfile: 'Renommer le profil',
  renamePlaceholder: 'Saisir un nouveau nom de profil',
  cancel: 'Annuler',
  save: 'Enregistrer',
  start: 'Démarrer',
  addMethodTabsLabel: 'Méthodes d’ajout de compte',
  oauthLogin: 'Connexion OAuth Web',
  saveCurrentProfile: 'Enregistrer le profil Codex actuel',
  importAuth: 'Importer auth.json',
  settingsCategories: 'Catégories de paramètres',
  config: 'Configuration',
  status: 'État',
  about: 'À propos',
  close: 'Fermer',
  waitingOAuth: 'En attente de l’autorisation Web',
  oauthPendingDescription: 'La page officielle d’autorisation est ouverte dans votre navigateur. Après la connexion, le sélecteur reviendra automatiquement. Vous pouvez annuler cette autorisation si vous ne souhaitez pas continuer.',
  cancelOAuth: 'Annuler l’autorisation',
  oauthTitle: 'Connexion OAuth Web',
  oauthDescription: 'Ouvre la page officielle de connexion dans votre navigateur. Après autorisation, le sélecteur reçoit le rappel et crée un nouveau profil de compte.',
  oauthNote: 'Utilisez cette option pour ajouter directement un nouveau compte ChatGPT / Codex. Une boîte de dialogue d’attente séparée s’affiche pendant l’autorisation et peut être annulée.',
  oauthAction: 'Démarrer l’autorisation Web',
  currentTitle: 'Enregistrer le profil Codex connecté actuel',
  currentDescription: 'Lit l’état d’authentification actuel depuis `~/.codex` et enregistre le compte connecté comme nouveau profil.',
  currentNote: 'Utilisez cette option si vous êtes déjà connecté dans le client Codex et souhaitez seulement enregistrer l’état actuel comme profil commutable.',
  currentAction: 'Enregistrer la connexion actuelle',
  importTitle: 'Importer auth.json',
  importDescription: 'Choisissez un `auth.json` externe ; le sélecteur l’analysera et l’importera comme nouveau profil de compte.',
  importNote: 'Utilisez cette option pour migrer un compte, restaurer une sauvegarde ou importer une authentification depuis un autre environnement.',
  importAction: 'Choisir auth.json',
  notProvided: 'Non fourni',
  remaining: 'restant',
  resetTime: 'Réinitialisation',
  notDetected: 'Non détecté',
  unknown: 'Inconnu',
  codexConfigDir: 'Dossier de configuration Codex',
  authMode: 'Mode d’authentification',
  currentAccount: 'Compte actuel',
  currentPlan: 'Forfait actuel',
  runtimeStatus: 'État d’exécution',
  codexRunning: 'Codex est en cours d’exécution',
  codexStopped: 'Codex n’est pas en cours d’exécution',
  statusDescription: 'État actuel de Codex et informations d’exécution du compte.',
  configDescription: 'Contrôle le comportement de l’application, le thème et la portée de configuration Codex.',
  language: 'Langue',
  languageDescription: 'Définit la langue d’affichage de l’interface.',
  launchAtStartup: 'Lancer au démarrage',
  launchAtStartupDescription: 'Démarrer automatiquement le sélecteur après la connexion Windows.',
  disabled: 'Désactivé',
  enabled: 'Activé',
  darkMode: 'Mode sombre',
  darkModeDescription: 'Définit si l’application utilise le thème sombre.',
  light: 'Clair',
  dark: 'Sombre',
  closeBehavior: 'Comportement du bouton fermer',
  closeBehaviorDescription: 'Choisir si le bouton fermer garde l’application en arrière-plan ou la quitte.',
  backgroundRun: 'Arrière-plan',
  quitApp: 'Quitter',
  appDataPath: 'Emplacement des données de l’application',
  configTomlStrategy: 'Stratégie de bascule du fichier de configuration (config.toml)',
  configTomlStrategyDescription: 'Choisir si le fichier de configuration Codex est partagé par tous les comptes ou bascule avec chaque profil.',
  shared: 'Partagé',
  perAccount: 'Par compte',
  currentTrackedFiles: 'Fichiers actuellement suivis',
  choose: 'Choisir',
  default: 'Par défaut',
  open: 'Ouvrir',
  aboutDescription: 'Informations sur l’application et lien du projet.',
  programName: 'Nom du programme',
  programVersion: 'Version du programme',
  author: 'Auteur',
  githubUrl: 'URL du projet Github',
  emptyProfileTitle: 'Aucun profil de compte',
  emptyProfileDescription: 'Cliquez sur le bouton plus en haut à droite pour ajouter un compte via OAuth Web, l’état de connexion Codex actuel ou l’import auth.json.',
  usageReadFailed: 'Échec de lecture du quota : {error}',
  reordered: 'Ordre des profils de compte mis à jour.',
  confirmSwitch: 'Basculer vers le profil « {name} » fermera d’abord Codex puis écrira ce profil. Continuer ?',
  switched: 'Profil « {name} » activé. L’état précédent a été sauvegardé dans : {path}',
  exportCancelled: 'Export de auth.json annulé.',
  exportedAuth: 'auth.json exporté pour « {name} » : {path}',
  confirmDelete: 'Supprimer le profil « {name} » ? Cela n’affecte pas le compte Codex actuellement connecté, mais supprime l’instantané du profil.',
  deleted: 'Profil « {name} » supprimé.',
  refreshingUsage: 'Actualisation de tous les quotas...',
  refreshedUsage: 'Tous les quotas ont été actualisés.',
  oauthCreated: 'Nouveau compte ajouté à la liste des profils.',
  oauthCancelled: 'Autorisation Web annulée.',
  currentProfileSaved: 'État de connexion Codex actuel enregistré comme nouveau profil.',
  importCancelled: 'Import auth.json annulé.',
  importedAuth: 'Nouveau compte importé depuis auth.json.',
  codexRestarted: 'Codex a redémarré.',
  renamed: 'Profil renommé en « {name} ».',
  languages: {
    'zh-CN': 'Chinois simplifié',
    'zh-TW': 'Chinois traditionnel',
    'en-US': 'Anglais',
    'fr-FR': 'Français',
    'de-DE': 'Allemand',
    'ja-JP': 'Japonais',
    'ko-KR': 'Coréen'
  }
};

I18N['de-DE'] = {
  ...I18N['en-US'],
  openSettings: 'Einstellungen öffnen',
  settings: 'Einstellungen',
  restartCodex: 'Codex neu starten',
  openProfilesFolder: 'Profilordner öffnen',
  switchToLight: 'Zum hellen Modus wechseln',
  switchToDark: 'Zum dunklen Modus wechseln',
  switchTheme: 'Design wechseln',
  profilesTitle: 'Kontoprofile',
  refreshAllUsage: 'Alle Kontingente aktualisieren',
  addAccount: 'Konto hinzufügen',
  closeTip: 'Hinweis schließen',
  fiveHourQuota: '5-Stunden-Kontingent',
  weeklyQuota: 'Wochenkontingent',
  switchAndLaunch: 'Wechseln und starten',
  downloadAuth: 'auth.json herunterladen',
  rename: 'Umbenennen',
  delete: 'Löschen',
  renameProfile: 'Profil umbenennen',
  renamePlaceholder: 'Neuen Profilnamen eingeben',
  cancel: 'Abbrechen',
  save: 'Speichern',
  start: 'Starten',
  addMethodTabsLabel: 'Methoden zum Hinzufügen von Konten',
  oauthLogin: 'Web-OAuth-Anmeldung',
  saveCurrentProfile: 'Aktuelles Codex-Profil speichern',
  importAuth: 'auth.json importieren',
  settingsCategories: 'Einstellungskategorien',
  config: 'Konfiguration',
  status: 'Status',
  about: 'Über',
  close: 'Schließen',
  waitingOAuth: 'Warten auf Web-Autorisierung',
  oauthPendingDescription: 'Die offizielle Autorisierungsseite wurde im Browser geöffnet. Nach der Anmeldung kehrt der Switcher automatisch zurück. Sie können die Autorisierung abbrechen, wenn Sie nicht fortfahren möchten.',
  cancelOAuth: 'Autorisierung abbrechen',
  oauthTitle: 'Web-OAuth-Anmeldung',
  oauthDescription: 'Öffnet die offizielle Anmeldeseite im Browser. Nach der Autorisierung empfängt der Switcher den Rückruf und erstellt ein neues Kontoprofil.',
  oauthNote: 'Verwenden Sie dies, um direkt ein neues ChatGPT- / Codex-Konto hinzuzufügen. Während der Autorisierung wird ein separater Wartedialog angezeigt und kann abgebrochen werden.',
  oauthAction: 'Web-Autorisierung starten',
  currentTitle: 'Aktuell angemeldetes Codex-Profil speichern',
  currentDescription: 'Liest den aktuellen Authentifizierungsstatus aus `~/.codex` und speichert das angemeldete Konto als neues Profil.',
  currentNote: 'Verwenden Sie dies, wenn Sie bereits im Codex-Client angemeldet sind und den aktuellen Status nur als wechselbares Profil speichern möchten.',
  currentAction: 'Aktuelle Anmeldung speichern',
  importTitle: 'auth.json importieren',
  importDescription: 'Wählen Sie eine externe `auth.json`; der Switcher analysiert sie und importiert sie als neues Kontoprofil.',
  importNote: 'Verwenden Sie dies für Kontomigration, Wiederherstellung aus Sicherungen oder Authentifizierung aus einer anderen Umgebung.',
  importAction: 'auth.json wählen',
  notProvided: 'Nicht angegeben',
  remaining: 'verbleibend',
  resetTime: 'Zurücksetzung',
  notDetected: 'Nicht erkannt',
  unknown: 'Unbekannt',
  codexConfigDir: 'Codex-Konfigurationsordner',
  authMode: 'Authentifizierungsmodus',
  currentAccount: 'Aktuelles Konto',
  currentPlan: 'Aktueller Tarif',
  runtimeStatus: 'Laufzeitstatus',
  codexRunning: 'Codex läuft',
  codexStopped: 'Codex läuft nicht',
  statusDescription: 'Aktueller Codex-Status und Laufzeitinformationen des Kontos.',
  configDescription: 'Steuert App-Verhalten, Theme und Umfang der Codex-Konfiguration.',
  language: 'Sprache',
  languageDescription: 'Legt die Anzeigesprache der Oberfläche fest.',
  launchAtStartup: 'Beim Start öffnen',
  launchAtStartupDescription: 'Den Switcher nach der Windows-Anmeldung automatisch starten.',
  disabled: 'Aus',
  enabled: 'Ein',
  darkMode: 'Dunkler Modus',
  darkModeDescription: 'Legt fest, ob die App das dunkle Theme verwendet.',
  light: 'Hell',
  dark: 'Dunkel',
  closeBehavior: 'Verhalten der Schließen-Schaltfläche',
  closeBehaviorDescription: 'Wählen, ob Schließen die App im Hintergrund hält oder beendet.',
  backgroundRun: 'Im Hintergrund',
  quitApp: 'App beenden',
  appDataPath: 'Speicherort der App-Daten',
  configTomlStrategy: 'Wechselstrategie der Konfigurationsdatei (config.toml)',
  configTomlStrategyDescription: 'Wählen, ob die Codex-Konfigurationsdatei von allen Konten gemeinsam genutzt wird oder mit jedem Profil wechselt.',
  shared: 'Gemeinsam',
  perAccount: 'Pro Konto',
  currentTrackedFiles: 'Aktuell verfolgte Dateien',
  choose: 'Wählen',
  default: 'Standard',
  open: 'Öffnen',
  aboutDescription: 'Anwendungsinformationen und Projektlink.',
  programName: 'Programmname',
  programVersion: 'Programmversion',
  author: 'Autor',
  githubUrl: 'Github-Projekt-URL',
  emptyProfileTitle: 'Noch keine Kontoprofile',
  emptyProfileDescription: 'Klicken Sie oben rechts auf Plus, um ein Konto über Web-OAuth, den aktuellen Codex-Anmeldestatus oder auth.json-Import hinzuzufügen.',
  usageReadFailed: 'Kontingent konnte nicht gelesen werden: {error}',
  reordered: 'Reihenfolge der Kontoprofile aktualisiert.',
  confirmSwitch: 'Beim Wechsel zum Profil „{name}“ wird Codex zuerst geschlossen und dieses Profil geschrieben. Fortfahren?',
  switched: 'Zum Profil „{name}“ gewechselt. Vorheriger Status wurde gesichert unter: {path}',
  exportCancelled: 'Export von auth.json abgebrochen.',
  exportedAuth: 'auth.json für „{name}“ exportiert: {path}',
  confirmDelete: 'Profil „{name}“ löschen? Das aktuelle Codex-Konto bleibt unverändert, aber der Profil-Snapshot wird entfernt.',
  deleted: 'Profil „{name}“ gelöscht.',
  refreshingUsage: 'Alle Kontingente werden aktualisiert...',
  refreshedUsage: 'Alle Kontingente wurden aktualisiert.',
  oauthCreated: 'Neues Konto zur Profilliste hinzugefügt.',
  oauthCancelled: 'Web-Autorisierung abgebrochen.',
  currentProfileSaved: 'Aktueller Codex-Anmeldestatus als neues Profil gespeichert.',
  importCancelled: 'Import von auth.json abgebrochen.',
  importedAuth: 'Neues Konto aus auth.json importiert.',
  codexRestarted: 'Codex wurde neu gestartet.',
  renamed: 'Profil in „{name}“ umbenannt.',
  languages: {
    'zh-CN': 'Vereinfachtes Chinesisch',
    'zh-TW': 'Traditionelles Chinesisch',
    'en-US': 'Englisch',
    'fr-FR': 'Französisch',
    'de-DE': 'Deutsch',
    'ja-JP': 'Japanisch',
    'ko-KR': 'Koreanisch'
  }
};

I18N['ja-JP'] = {
  ...I18N['en-US'],
  openSettings: '設定を開く',
  settings: '設定',
  restartCodex: 'Codex を再起動',
  openProfilesFolder: 'プロファイルフォルダーを開く',
  switchToLight: 'ライトモードに切り替え',
  switchToDark: 'ダークモードに切り替え',
  switchTheme: 'テーマを切り替え',
  profilesTitle: 'アカウントプロファイル',
  refreshAllUsage: 'すべてのアカウント上限を更新',
  addAccount: 'アカウントを追加',
  closeTip: '通知を閉じる',
  fiveHourQuota: '5時間上限',
  weeklyQuota: '週間上限',
  switchAndLaunch: '切り替えて起動',
  downloadAuth: 'auth.json をダウンロード',
  rename: '名前を変更',
  delete: '削除',
  renameProfile: 'プロファイル名を変更',
  renamePlaceholder: '新しいプロファイル名を入力',
  cancel: 'キャンセル',
  save: '保存',
  start: '開始',
  addMethodTabsLabel: 'アカウント追加方法',
  oauthLogin: 'Web OAuth ログイン',
  saveCurrentProfile: '現在の Codex プロファイルを保存',
  importAuth: 'auth.json をインポート',
  settingsCategories: '設定カテゴリ',
  config: '構成',
  status: '状態',
  about: '情報',
  close: '閉じる',
  waitingOAuth: 'Web 認可を待機中',
  oauthPendingDescription: '公式認可ページをブラウザーで開きました。ログイン完了後、スイッチャーに自動で戻ります。続行しない場合はこの認可をキャンセルできます。',
  cancelOAuth: '認可をキャンセル',
  oauthTitle: 'Web OAuth ログイン',
  oauthDescription: '公式ログインページをブラウザーで開きます。認可後、スイッチャーがコールバックを受け取り、新しいアカウントプロファイルを作成します。',
  oauthNote: '新しい ChatGPT / Codex アカウントを直接追加する場合に使用します。認可待機中は専用ダイアログが表示され、キャンセルできます。',
  oauthAction: 'Web 認可を開始',
  currentTitle: '現在ログイン中の Codex プロファイルを保存',
  currentDescription: 'ローカルの `~/.codex` から現在の認証状態を読み取り、ログイン済みアカウントを新しいプロファイルとして保存します。',
  currentNote: 'Codex クライアントで既にログイン済みで、現在の状態を切り替え可能なプロファイルとして保存したい場合に使用します。',
  currentAction: '現在のログインを保存',
  importTitle: 'auth.json をインポート',
  importDescription: '外部の `auth.json` を選択すると、スイッチャーが解析して新しいアカウントプロファイルとしてインポートします。',
  importNote: 'アカウント移行、バックアップ復元、別環境の認証状態の取り込みに使用します。',
  importAction: 'auth.json を選択',
  notProvided: '未提供',
  remaining: '残り',
  resetTime: 'リセット時刻',
  notDetected: '未検出',
  unknown: '不明',
  codexConfigDir: 'Codex 設定ディレクトリ',
  authMode: '認証モード',
  currentAccount: '現在のアカウント',
  currentPlan: '現在のプラン',
  runtimeStatus: '実行状態',
  codexRunning: 'Codex は実行中',
  codexStopped: 'Codex は停止中',
  statusDescription: '現在の Codex 状態とアカウント実行情報。',
  configDescription: 'アプリ動作、テーマ表示、Codex 設定の適用範囲を制御します。',
  language: '言語',
  languageDescription: 'インターフェースの表示言語を設定します。',
  launchAtStartup: '起動時に開始',
  launchAtStartupDescription: 'Windows ログイン後にスイッチャーを自動起動します。',
  disabled: 'オフ',
  enabled: 'オン',
  darkMode: 'ダークモード',
  darkModeDescription: 'アプリでダークテーマを使用するか設定します。',
  light: 'ライト',
  dark: 'ダーク',
  closeBehavior: '閉じるボタンの動作',
  closeBehaviorDescription: '閉じるボタンでアプリをバックグラウンドに残すか終了するかを選択します。',
  backgroundRun: 'バックグラウンド',
  quitApp: 'アプリを終了',
  appDataPath: 'アプリデータ保存場所',
  configTomlStrategy: '設定ファイル (config.toml) の切り替え方針',
  configTomlStrategyDescription: 'Codex 設定ファイルを全アカウントで共有するか、各アカウントプロファイルと一緒に切り替えるかを選択します。',
  shared: '共有',
  perAccount: 'アカウント別',
  currentTrackedFiles: '現在追跡中のファイル',
  choose: '選択',
  default: '既定',
  open: '開く',
  aboutDescription: 'アプリ情報とプロジェクトリンク。',
  programName: 'プログラム名',
  programVersion: 'プログラムバージョン',
  author: '作者',
  githubUrl: 'Github プロジェクト URL',
  emptyProfileTitle: 'アカウントプロファイルはまだありません',
  emptyProfileDescription: '右上のプラスボタンから、Web OAuth、現在の Codex ログイン状態、または auth.json インポートでアカウントを追加できます。',
  usageReadFailed: '上限の読み取りに失敗しました：{error}',
  reordered: 'アカウントプロファイルの順序を更新しました。',
  confirmSwitch: 'プロファイル「{name}」に切り替えると、先に Codex を閉じてからこのプロファイルを書き込みます。続行しますか？',
  switched: 'プロファイル「{name}」に切り替えました。以前の状態は次にバックアップされました：{path}',
  exportCancelled: 'auth.json のエクスポートをキャンセルしました。',
  exportedAuth: '「{name}」の auth.json をエクスポートしました：{path}',
  confirmDelete: 'プロファイル「{name}」を削除しますか？現在ログイン中の Codex アカウントには影響しませんが、このプロファイルのスナップショットは削除されます。',
  deleted: 'プロファイル「{name}」を削除しました。',
  refreshingUsage: 'すべてのアカウント上限を更新中...',
  refreshedUsage: 'すべてのアカウント上限を更新しました。',
  oauthCreated: '新しいアカウントをプロファイル一覧に追加しました。',
  oauthCancelled: 'Web 認可をキャンセルしました。',
  currentProfileSaved: '現在の Codex ログイン状態を新しいプロファイルとして保存しました。',
  importCancelled: 'auth.json のインポートをキャンセルしました。',
  importedAuth: 'auth.json から新しいアカウントをインポートしました。',
  codexRestarted: 'Codex を再起動しました。',
  renamed: 'プロファイル名を「{name}」に変更しました。',
  languages: {
    'zh-CN': '簡体字中国語',
    'zh-TW': '繁体字中国語',
    'en-US': '英語',
    'fr-FR': 'フランス語',
    'de-DE': 'ドイツ語',
    'ja-JP': '日本語',
    'ko-KR': '韓国語'
  }
};

I18N['ko-KR'] = {
  ...I18N['en-US'],
  openSettings: '설정 열기',
  settings: '설정',
  restartCodex: 'Codex 다시 시작',
  openProfilesFolder: '프로필 폴더 열기',
  switchToLight: '라이트 모드로 전환',
  switchToDark: '다크 모드로 전환',
  switchTheme: '테마 전환',
  profilesTitle: '계정 프로필',
  refreshAllUsage: '모든 계정 한도 새로 고침',
  addAccount: '계정 추가',
  closeTip: '알림 닫기',
  fiveHourQuota: '5시간 한도',
  weeklyQuota: '주간 한도',
  switchAndLaunch: '전환 후 실행',
  downloadAuth: 'auth.json 다운로드',
  rename: '이름 변경',
  delete: '삭제',
  renameProfile: '프로필 이름 변경',
  renamePlaceholder: '새 프로필 이름 입력',
  cancel: '취소',
  save: '저장',
  start: '시작',
  addMethodTabsLabel: '계정 추가 방식',
  oauthLogin: '웹 OAuth 로그인',
  saveCurrentProfile: '현재 Codex 프로필 저장',
  importAuth: 'auth.json 가져오기',
  settingsCategories: '설정 카테고리',
  config: '구성',
  status: '상태',
  about: '정보',
  close: '닫기',
  waitingOAuth: '웹 권한 부여 대기 중',
  oauthPendingDescription: '공식 권한 부여 페이지가 브라우저에서 열렸습니다. 로그인 완료 후 전환기로 자동 복귀합니다. 계속하지 않으려면 이번 권한 부여를 취소할 수 있습니다.',
  cancelOAuth: '권한 부여 취소',
  oauthTitle: '웹 OAuth 로그인',
  oauthDescription: '브라우저에서 공식 로그인 페이지를 엽니다. 권한 부여 후 전환기가 콜백을 받아 새 계정 프로필을 만듭니다.',
  oauthNote: '새 ChatGPT / Codex 계정을 직접 추가할 때 사용합니다. 권한 부여 대기 중에는 별도 상태 창이 표시되며 취소할 수 있습니다.',
  oauthAction: '웹 권한 부여 시작',
  currentTitle: '현재 로그인된 Codex 프로필 저장',
  currentDescription: '로컬 `~/.codex`의 현재 인증 상태를 읽고 로그인된 계정을 새 프로필로 저장합니다.',
  currentNote: 'Codex 클라이언트에서 이미 로그인했으며 현재 상태를 전환 가능한 프로필로 저장하려는 경우 사용합니다.',
  currentAction: '현재 로그인 저장',
  importTitle: 'auth.json 가져오기',
  importDescription: '외부 `auth.json` 파일을 선택하면 전환기가 인증 정보를 분석해 새 계정 프로필로 가져옵니다.',
  importNote: '계정 마이그레이션, 백업 복원 또는 다른 환경의 인증 상태를 현재 전환기로 가져올 때 사용합니다.',
  importAction: 'auth.json 선택',
  notProvided: '제공되지 않음',
  remaining: '남음',
  resetTime: '재설정 시간',
  notDetected: '감지되지 않음',
  unknown: '알 수 없음',
  codexConfigDir: 'Codex 구성 파일 디렉터리',
  authMode: '인증 모드',
  currentAccount: '현재 계정',
  currentPlan: '현재 플랜',
  runtimeStatus: '실행 상태',
  codexRunning: 'Codex 실행 중',
  codexStopped: 'Codex가 실행 중이 아님',
  statusDescription: '현재 Codex 상태와 계정 실행 정보입니다.',
  configDescription: '앱 동작, 테마 표시, Codex 구성 파일 적용 범위를 제어합니다.',
  language: '언어',
  languageDescription: '인터페이스 표시 언어를 설정합니다.',
  launchAtStartup: '시작 시 실행',
  launchAtStartupDescription: 'Windows 로그인 후 전환기를 자동으로 시작합니다.',
  disabled: '끄기',
  enabled: '켜기',
  darkMode: '다크 모드',
  darkModeDescription: '앱에서 다크 테마를 사용할지 설정합니다.',
  light: '라이트',
  dark: '다크',
  closeBehavior: '닫기 버튼 동작',
  closeBehaviorDescription: '창 닫기 버튼을 눌렀을 때 앱을 백그라운드로 유지할지 종료할지 선택합니다.',
  backgroundRun: '백그라운드 실행',
  quitApp: '앱 종료',
  appDataPath: '앱 데이터 저장 위치',
  configTomlStrategy: '구성 파일 (config.toml) 전환 전략',
  configTomlStrategyDescription: 'Codex 구성 파일을 모든 계정에서 공유할지, 각 계정 프로필과 함께 전환할지 선택합니다.',
  shared: '공유',
  perAccount: '계정별',
  currentTrackedFiles: '현재 추적 파일',
  choose: '선택',
  default: '기본값',
  open: '열기',
  aboutDescription: '애플리케이션 정보 및 프로젝트 링크입니다.',
  programName: '프로그램 이름',
  programVersion: '프로그램 버전',
  author: '작성자',
  githubUrl: 'Github 프로젝트 주소',
  emptyProfileTitle: '아직 계정 프로필이 없습니다',
  emptyProfileDescription: '오른쪽 위의 더하기 버튼을 눌러 웹 OAuth, 현재 Codex 로그인 상태 저장 또는 auth.json 가져오기로 계정을 추가할 수 있습니다.',
  usageReadFailed: '한도 읽기 실패: {error}',
  reordered: '계정 프로필 순서가 업데이트되었습니다.',
  confirmSwitch: '프로필 "{name}"(으)로 전환하면 먼저 Codex를 닫고 이 프로필을 씁니다. 계속하시겠습니까?',
  switched: '프로필 "{name}"(으)로 전환했습니다. 이전 상태 백업 위치: {path}',
  exportCancelled: 'auth.json 내보내기를 취소했습니다.',
  exportedAuth: '"{name}"의 auth.json을 내보냈습니다: {path}',
  confirmDelete: '프로필 "{name}"을(를) 삭제하시겠습니까? 현재 로그인된 Codex 계정에는 영향을 주지 않지만 이 프로필 스냅샷은 제거됩니다.',
  deleted: '프로필 "{name}"을(를) 삭제했습니다.',
  refreshingUsage: '모든 계정 한도를 새로 고치는 중...',
  refreshedUsage: '모든 계정 한도를 새로 고쳤습니다.',
  oauthCreated: '새 계정이 프로필 목록에 추가되었습니다.',
  oauthCancelled: '웹 권한 부여가 취소되었습니다.',
  currentProfileSaved: '현재 Codex 로그인 상태를 새 프로필로 저장했습니다.',
  importCancelled: 'auth.json 가져오기를 취소했습니다.',
  importedAuth: 'auth.json에서 새 계정을 가져왔습니다.',
  codexRestarted: 'Codex를 다시 시작했습니다.',
  renamed: '프로필 이름을 "{name}"(으)로 변경했습니다.',
  languages: {
    'zh-CN': '중국어 간체',
    'zh-TW': '중국어 번체',
    'en-US': '영어',
    'fr-FR': '프랑스어',
    'de-DE': '독일어',
    'ja-JP': '일본어',
    'ko-KR': '한국어'
  }
};

const addMethodConfig = {
  oauth: {
    title: 'oauthTitle',
    description: 'oauthDescription',
    note: 'oauthNote',
    actionLabel: 'oauthAction'
  },
  current: {
    title: 'currentTitle',
    description: 'currentDescription',
    note: 'currentNote',
    actionLabel: 'currentAction'
  },
  'import-auth': {
    title: 'importTitle',
    description: 'importDescription',
    note: 'importNote',
    actionLabel: 'importAction'
  }
};

function currentLanguage() {
  const language = state.settingsDraft?.language ?? state.data?.settings?.language;
  return SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_RENDERER_SETTINGS.language;
}

function t(key) {
  return I18N[currentLanguage()]?.[key] ?? I18N['zh-CN'][key] ?? key;
}

function tf(key, values = {}) {
  return String(t(key)).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
}

function setBusy(busy, busyMode = null) {
  state.busy = busy;
  state.busyMode = busy ? busyMode : null;
  document.querySelectorAll('button').forEach((button) => {
    button.disabled = busy && button.dataset.allowBusy !== 'true';
  });
}

function applyTheme(theme, { persist = true } = {}) {
  state.theme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', state.theme);
  if (persist) {
    localStorage.setItem(THEME_STORAGE_KEY, state.theme);
  }

  if (themeToggleBtnEl) {
    const nextLabel = state.theme === 'dark' ? t('switchToLight') : t('switchToDark');
    themeToggleBtnEl.setAttribute('aria-label', nextLabel);
    themeToggleBtnEl.setAttribute('title', nextLabel);
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') {
    applyTheme(saved);
    return;
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light');
}

function renderFlashMessage(message) {
  if (!message) {
    flashEl.classList.add('hidden');
    flashTextEl.textContent = '';
    return;
  }

  state.activeFlashMessage = message;
  flashTextEl.textContent = message;
  flashEl.classList.remove('hidden');
}

function dismissFlash() {
  if (state.flashQueue.length) {
    renderFlashMessage(state.flashQueue.shift());
    return;
  }

  state.activeFlashMessage = '';
  flashEl.classList.add('hidden');
  flashTextEl.textContent = '';
}

function showFlash(message, { replace = false, clearQueue = false } = {}) {
  if (!message) {
    if (clearQueue) {
      state.flashQueue = [];
    }
    dismissFlash();
    return;
  }

  if (clearQueue) {
    state.flashQueue = [];
  }

  if (replace || !state.activeFlashMessage) {
    renderFlashMessage(message);
    return;
  }

  state.flashQueue.push(message);
}

function formatResetTime(quota) {
  if (!quota?.resetsAt) {
    return t('notProvided');
  }

  const resetDate = new Date(quota.resetsAt * 1000);
  if (quota.windowMinutes && quota.windowMinutes < 24 * 60) {
    return resetDate.toLocaleTimeString(currentLanguage(), {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  return resetDate.toLocaleString(currentLanguage(), {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function formatQuota(quota) {
  if (!quota) {
    return `<strong>--%</strong><span>${t('remaining')}</span>`;
  }

  return `<strong>${Math.round(quota.remainingPercent)}%</strong><span>${t('remaining')}</span>`;
}

function formatQuotaReset(quota) {
  return `
    <span class="quota-reset-label">${t('resetTime')}</span>
    <span class="quota-reset-value">${formatResetTime(quota)}</span>
  `;
}

function formatPlanType(planType) {
  if (!planType) {
    return t('unknown');
  }

  const normalized = String(planType).replace(/[_-]+/g, ' ').trim();
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function isFreePlan(planType) {
  return String(planType || '').trim().toLowerCase() === 'free';
}

function renderMetric(label, value) {
  const wrapper = document.createElement('div');
  wrapper.className = 'metric';
  wrapper.innerHTML = `
    <div class="metric-label">${label}</div>
    <div class="metric-value">${value || t('notDetected')}</div>
  `;
  return wrapper;
}

function getCurrentStateMetrics(data) {
  if (!data) {
    return [];
  }

  const metrics = [
    [t('codexConfigDir'), data.codexHome],
    [t('authMode'), data.current.authMode || t('unknown')],
    [t('currentAccount'), data.current.accountId || data.current.email || t('notDetected')],
    [t('currentPlan'), formatPlanType(data.current.planType)]
  ];

  if (!isFreePlan(data.current.planType)) {
    metrics.push([
      t('fiveHourQuota'),
      `${Math.round(data.current.usage?.fiveHour?.remainingPercent ?? 0)}% ${t('remaining')}`
    ]);
  }

  metrics.push([
    t('weeklyQuota'),
    `${Math.round(data.current.usage?.weekly?.remainingPercent ?? 0)}% ${t('remaining')}`
  ]);

  metrics.push([
    t('runtimeStatus'),
    data.runtime.runningCount ? t('codexRunning') : t('codexStopped')
  ]);

  return metrics;
}

function renderCurrentState(data) {
  runtimeBadgeEl.classList.toggle('running', Boolean(data.runtime.runningCount));
  runtimeBadgeEl.classList.toggle('stopped', !data.runtime.runningCount);
  runtimeBadgeEl.textContent = data.runtime.runningCount
    ? t('codexRunning')
    : t('codexStopped');

  if (!currentStateModalEl.classList.contains('hidden')) {
    renderSettings();
  }
}

function renderSettingsNav() {
  currentStateModalEl.querySelectorAll('[data-settings-section]').forEach((button) => {
    button.classList.toggle('active', button.dataset.settingsSection === state.settingsSection);
  });
}

function renderSettingRow(label, value) {
  const row = document.createElement('div');
  row.className = 'settings-row';
  row.innerHTML = `
    <div>
      <div class="settings-row-label">${label}</div>
      <div class="settings-row-value">${value || t('notDetected')}</div>
    </div>
  `;
  return row;
}

function getSettingsDraft() {
  if (!state.settingsDraft) {
    state.settingsDraft = {
      ...DEFAULT_RENDERER_SETTINGS,
      ...(state.data?.settings ?? {}),
      darkMode: state.data?.settings?.darkMode ?? (state.theme === 'dark')
    };
  }
  return state.settingsDraft;
}

async function saveSettingsPatch(patch) {
  const nextSettings = {
    ...getSettingsDraft(),
    ...patch
  };
  state.settingsDraft = nextSettings;
  state.data = await window.codexSwitcher.saveSettings(nextSettings);
  state.settingsDraft = {
    ...DEFAULT_RENDERER_SETTINGS,
    ...(state.data?.settings ?? {})
  };
  applyTheme(state.data.settings?.darkMode ? 'dark' : 'light');
  renderAll();
  renderSettings();
}

function renderSegmentedSetting({ label, description, value, field, options }) {
  const row = document.createElement('div');
  row.className = 'settings-row settings-control-row';
  row.innerHTML = `
    <div>
      <div class="settings-row-label">${label}</div>
      <div class="settings-row-value">${description}</div>
    </div>
    <div class="segmented-control" role="group" aria-label="${label}">
      ${options.map((option) => `
        <button
          type="button"
          class="${option.value === value ? 'active' : ''}"
          data-setting-field="${field}"
          data-setting-value="${option.value}"
        >${option.label}</button>
      `).join('')}
    </div>
  `;
  return row;
}

function renderSelectSetting({ label, description, value, field, options }) {
  const row = document.createElement('div');
  row.className = 'settings-row settings-control-row';
  row.innerHTML = `
    <div>
      <div class="settings-row-label">${label}</div>
      <div class="settings-row-value">${description}</div>
    </div>
    <select class="settings-select" data-setting-select="${field}" aria-label="${label}">
      ${options.map((option) => `
        <option value="${option.value}" ${option.value === value ? 'selected' : ''}>${option.label}</option>
      `).join('')}
    </select>
  `;
  return row;
}

function renderSettingsStatus() {
  const section = document.createElement('div');
  section.className = 'settings-section';
  section.innerHTML = `
    <div class="settings-section-head">
      <h3>${t('status')}</h3>
      <p>${t('statusDescription')}</p>
    </div>
  `;

  const grid = document.createElement('div');
  grid.className = 'metric-grid settings-metric-grid';
  grid.append(...getCurrentStateMetrics(state.data).map(([label, value]) => renderMetric(label, value)));
  section.append(grid);
  return section;
}

function renderSettingsConfig() {
  const draft = getSettingsDraft();
  const section = document.createElement('div');
  section.className = 'settings-section';
  section.innerHTML = `
    <div class="settings-section-head">
      <h3>${t('config')}</h3>
      <p>${t('configDescription')}</p>
    </div>
  `;

  const list = document.createElement('div');
  list.className = 'settings-list';
  list.append(
    renderSelectSetting({
      label: t('language'),
      description: t('languageDescription'),
      field: 'language',
      value: draft.language,
      options: SUPPORTED_LANGUAGES.map((language) => ({
        value: language,
        label: LANGUAGE_LABELS[language]
      }))
    }),
    renderSegmentedSetting({
      label: t('launchAtStartup'),
      description: t('launchAtStartupDescription'),
      field: 'launchAtStartup',
      value: String(Boolean(draft.launchAtStartup)),
      options: [
        { value: 'false', label: t('disabled') },
        { value: 'true', label: t('enabled') }
      ]
    }),
    renderSegmentedSetting({
      label: t('darkMode'),
      description: t('darkModeDescription'),
      field: 'darkMode',
      value: String(Boolean(draft.darkMode)),
      options: [
        { value: 'false', label: t('light') },
        { value: 'true', label: t('dark') }
      ]
    }),
    renderSegmentedSetting({
      label: t('closeBehavior'),
      description: t('closeBehaviorDescription'),
      field: 'closeBehavior',
      value: draft.closeBehavior,
      options: [
        { value: 'background', label: t('backgroundRun') },
        { value: 'quit', label: t('quitApp') }
      ]
    }),
    renderSettingRow(
      t('appDataPath'),
      draft.appDataPath || state.data?.defaultAppDataPath || state.data?.appDataPath
    ),
    renderSegmentedSetting({
      label: t('configTomlStrategy'),
      description: t('configTomlStrategyDescription'),
      field: 'configTomlMode',
      value: draft.configTomlMode,
      options: [
        { value: 'shared', label: t('shared') },
        { value: 'per-account', label: t('perAccount') }
      ]
    }),
    renderSettingRow(t('currentTrackedFiles'), (state.data?.trackedFiles ?? []).join('、'))
  );
  section.append(list);

  const appDataRow = list.children[4];
  const appDataActions = document.createElement('div');
  appDataActions.className = 'settings-inline-actions';
  appDataActions.innerHTML = `
    <button type="button" class="settings-inline-button ghost" data-action="choose-app-data">${t('choose')}</button>
    <button type="button" class="settings-inline-button ghost" data-action="reset-app-data">${t('default')}</button>
    <button type="button" class="settings-inline-button ghost" data-action="open-user-data">${t('open')}</button>
  `;
  appDataRow.append(appDataActions);

  return section;
}

function renderSettingsAbout() {
  const section = document.createElement('div');
  section.className = 'settings-section';
  section.innerHTML = `
    <div class="settings-section-head">
      <h3>${t('about')}</h3>
      <p>${t('aboutDescription')}</p>
    </div>
  `;

  const list = document.createElement('div');
  list.className = 'settings-list';
  list.append(
    renderSettingRow(t('programName'), 'XinT Codex Account Switcher'),
    renderSettingRow(t('programVersion'), state.data?.appVersion || t('unknown')),
    renderSettingRow(t('author'), 'XinTycd'),
    renderSettingRow(t('githubUrl'), GITHUB_URL)
  );

  const githubRow = list.children[3];
  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'settings-inline-button ghost';
  action.dataset.action = 'open-github';
  action.textContent = t('open');
  githubRow.append(action);

  section.append(list);
  return section;
}

function renderSettings() {
  if (!settingsContentEl) {
    return;
  }

  renderSettingsNav();
  settingsContentEl.innerHTML = '';

  const sectionMap = {
    config: renderSettingsConfig,
    status: renderSettingsStatus,
    about: renderSettingsAbout
  };
  settingsContentEl.append((sectionMap[state.settingsSection] || renderSettingsConfig)());

  settingsContentEl.querySelectorAll('[data-setting-field]').forEach((button) => {
    button.addEventListener('click', async () => {
      const field = button.dataset.settingField;
      const value = button.dataset.settingValue;
      await runAction(async () => {
        await saveSettingsPatch({
          [field]: value === 'true' ? true : value === 'false' ? false : value
        });
      });
    });
  });

  settingsContentEl.querySelectorAll('[data-setting-select]').forEach((select) => {
    select.addEventListener('change', async () => {
      await runAction(async () => {
        await saveSettingsPatch({
          [select.dataset.settingSelect]: select.value
        });
      });
    });
  });

  settingsContentEl.querySelector('[data-action="open-user-data"]')?.addEventListener('click', async () => {
    await window.codexSwitcher.openUserDataFolder();
  });

  settingsContentEl.querySelector('[data-action="choose-app-data"]')?.addEventListener('click', async () => {
    const folderPath = await window.codexSwitcher.chooseAppDataFolder();
    if (folderPath) {
      await runAction(async () => {
        await saveSettingsPatch({ appDataPath: folderPath });
      });
    }
  });

  settingsContentEl.querySelector('[data-action="reset-app-data"]')?.addEventListener('click', async () => {
    await runAction(async () => {
      await saveSettingsPatch({ appDataPath: '' });
    });
  });

  settingsContentEl.querySelector('[data-action="open-github"]')?.addEventListener('click', async () => {
    await window.codexSwitcher.openExternal(GITHUB_URL);
  });
}

function setText(selector, text) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = text;
  }
}

function setAttr(selector, name, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.setAttribute(name, value);
  }
}

function applyLocale() {
  document.documentElement.lang = currentLanguage();
  document.title = t('appTitle');

  setText('.section-head h2', t('profilesTitle'));
  setText('#renameTitle', t('renameProfile'));
  setText('#addAccountTitle', t('addAccount'));
  setText('#currentStateTitle', t('settings'));
  setText('#oauthPendingTitle', t('waitingOAuth'));
  setText('#oauthPendingModal .method-description', t('oauthPendingDescription'));
  setText('#renameForm [data-action="close-rename"]', t('cancel'));
  setText('#renameForm button[type="submit"]', t('save'));
  setText('#addAccountModal .modal-actions [data-action="close-add-account"]', t('cancel'));
  setText('#addMethodActionBtn', t('start'));
  setText('#currentStateModal .settings-actions [data-action="close-current-state"]', t('close'));
  setText('#cancelOAuthBtn', t('cancelOAuth'));

  setText('[data-add-method-tab="oauth"]', t('oauthLogin'));
  setText('[data-add-method-tab="current"]', t('saveCurrentProfile'));
  setText('[data-add-method-tab="import-auth"]', t('importAuth'));
  setText('[data-settings-section="config"]', t('config'));
  setText('[data-settings-section="status"]', t('status'));
  setText('[data-settings-section="about"]', t('about'));

  setAttr('#statusBtn', 'aria-label', t('openSettings'));
  setAttr('#statusBtn', 'title', t('settings'));
  setAttr('#restartCodexBtn', 'aria-label', t('restartCodex'));
  setAttr('#restartCodexBtn', 'title', t('restartCodex'));
  setAttr('#openProfilesBtn', 'aria-label', t('openProfilesFolder'));
  setAttr('#openProfilesBtn', 'title', t('openProfilesFolder'));
  setAttr('#themeToggleBtn', 'title', t('switchTheme'));
  setAttr('#refreshUsageBtn', 'aria-label', t('refreshAllUsage'));
  setAttr('#refreshUsageBtn', 'title', t('refreshAllUsage'));
  setAttr('#addAccountBtn', 'aria-label', t('addAccount'));
  setAttr('#addAccountBtn', 'title', t('addAccount'));
  setAttr('#flashCloseBtn', 'aria-label', t('closeTip'));
  setAttr('#flashCloseBtn', 'title', t('closeTip'));
  setAttr('#renameInput', 'placeholder', t('renamePlaceholder'));
  setAttr('.method-tabs', 'aria-label', t('addMethodTabsLabel'));
  setAttr('.settings-sidebar', 'aria-label', t('settingsCategories'));
  applyTheme(state.theme, { persist: false });
}

function renderAddMethod() {
  const config = addMethodConfig[state.addMethod];
  addMethodTitleEl.textContent = t(config.title);
  addMethodDescriptionEl.textContent = t(config.description);
  addMethodNoteEl.textContent = t(config.note);
  addMethodActionBtnEl.textContent = t(config.actionLabel);

  addAccountModalEl.querySelectorAll('[data-add-method-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.addMethodTab === state.addMethod);
  });
}

function renderEmptyProfiles() {
  const empty = document.createElement('div');
  empty.className = 'profile-card';
  empty.innerHTML = `
    <div class="profile-head">
      <div class="profile-title-row">
        <div class="profile-name">${t('emptyProfileTitle')}</div>
      </div>
    </div>
    <div class="profile-meta">${t('emptyProfileDescription')}</div>
  `;
  profilesEl.append(empty);
}

function renderProfiles(data) {
  profilesEl.innerHTML = '';

  if (!data.profiles.length) {
    renderEmptyProfiles();
    return;
  }

  for (const profile of data.profiles) {
    const fragment = profileCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.profile-card');
    const nameEl = fragment.querySelector('.profile-name');
    const planBadgeEl = fragment.querySelector('.plan-badge');
    const metaEl = fragment.querySelector('.profile-meta');
    const statusDotEl = fragment.querySelector('.status-dot');
    const quotaGridEl = fragment.querySelector('.quota-grid');
    const fiveHourBlockEl = fragment.querySelector('[data-quota-block="five-hour"]');
    const fiveHourEl = fragment.querySelector('[data-quota="five-hour"]');
    const weeklyEl = fragment.querySelector('[data-quota="weekly"]');
    const fiveHourBarEl = fragment.querySelector('[data-quota-bar="five-hour"]');
    const weeklyBarEl = fragment.querySelector('[data-quota-bar="weekly"]');
    const fiveHourResetEl = fragment.querySelector('[data-quota-reset="five-hour"]');
    const weeklyResetEl = fragment.querySelector('[data-quota-reset="weekly"]');
    const applyBtn = fragment.querySelector('[data-action="apply"]');
    const downloadAuthBtn = fragment.querySelector('[data-action="download-auth"]');
    const renameBtn = fragment.querySelector('[data-action="rename"]');
    const deleteBtn = fragment.querySelector('[data-action="delete"]');

    card.dataset.profileId = profile.id;
    card.draggable = true;
    nameEl.textContent = profile.name || profile.id;
    planBadgeEl.textContent = formatPlanType(profile.planType);
    applyBtn.textContent = t('switchAndLaunch');
    downloadAuthBtn.setAttribute('aria-label', t('downloadAuth'));
    downloadAuthBtn.setAttribute('title', t('downloadAuth'));
    renameBtn.setAttribute('aria-label', t('rename'));
    renameBtn.setAttribute('title', t('rename'));
    deleteBtn.setAttribute('aria-label', t('delete'));
    deleteBtn.setAttribute('title', t('delete'));
    fiveHourBlockEl.querySelector('.quota-label').textContent = t('fiveHourQuota');
    fragment.querySelector('[data-quota-block="weekly"] .quota-label').textContent = t('weeklyQuota');

    if (isFreePlan(profile.planType)) {
      fiveHourBlockEl.classList.add('hidden');
      quotaGridEl.classList.add('single');
    }

    fiveHourEl.innerHTML = formatQuota(profile.usage?.fiveHour);
    weeklyEl.innerHTML = formatQuota(profile.usage?.weekly);
    fiveHourBarEl.style.width = `${Math.max(0, Math.min(100, profile.usage?.fiveHour?.remainingPercent ?? 0))}%`;
    weeklyBarEl.style.width = `${Math.max(0, Math.min(100, profile.usage?.weekly?.remainingPercent ?? 0))}%`;
    fiveHourResetEl.innerHTML = formatQuotaReset(profile.usage?.fiveHour);
    weeklyResetEl.innerHTML = formatQuotaReset(profile.usage?.weekly);
    metaEl.textContent = profile.usageError
      ? tf('usageReadFailed', { error: profile.usageError })
      : '';

    if (profile.isActive) {
      statusDotEl.classList.add('active');
    }

    card.addEventListener('dragstart', (event) => {
      if (state.busy) {
        event.preventDefault();
        return;
      }

      state.draggingProfileId = profile.id;
      card.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', profile.id);
    });

    card.addEventListener('dragend', () => {
      state.draggingProfileId = null;
      profilesEl.querySelectorAll('.profile-card').forEach((profileCard) => {
        profileCard.classList.remove('dragging', 'drag-over');
      });
    });

    card.addEventListener('dragover', (event) => {
      if (!state.draggingProfileId || state.draggingProfileId === profile.id) {
        return;
      }

      event.preventDefault();
      card.classList.add('drag-over');
      event.dataTransfer.dropEffect = 'move';
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', async (event) => {
      event.preventDefault();
      card.classList.remove('drag-over');

      const draggedProfileId = state.draggingProfileId || event.dataTransfer.getData('text/plain');
      if (!draggedProfileId || draggedProfileId === profile.id) {
        return;
      }

      const currentIds = state.data.profiles.map((item) => item.id);
      const fromIndex = currentIds.indexOf(draggedProfileId);
      const toIndex = currentIds.indexOf(profile.id);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
        return;
      }

      const reorderedIds = [...currentIds];
      const [movedId] = reorderedIds.splice(fromIndex, 1);
      reorderedIds.splice(toIndex, 0, movedId);

      await runAction(async () => {
        state.data = await window.codexSwitcher.reorderProfiles(reorderedIds);
        renderAll();
        showFlash(t('reordered'), { replace: true });
      });
    });

    applyBtn.addEventListener('click', async () => {
      const targetLabel = profile.name || profile.id;
      const confirmed = window.confirm(tf('confirmSwitch', { name: targetLabel }));
      if (!confirmed) {
        return;
      }

      await runAction(async () => {
        state.data = await window.codexSwitcher.applyProfile(profile.id, true);
        renderAll();
        refreshUsageInBackground();
        const backupDir = state.data.lastAction?.backupDir;
        showFlash(tf('switched', { name: targetLabel, path: backupDir }), { replace: true });
      });
    });

    renameBtn.addEventListener('click', () => {
      openRenameModal(profile);
    });

    downloadAuthBtn.addEventListener('click', async () => {
      const targetLabel = profile.name || profile.id;
      await runAction(async () => {
        const result = await window.codexSwitcher.exportAuthJson(profile.id, targetLabel);
        if (result?.cancelled) {
          showFlash(t('exportCancelled'), { replace: true });
          return;
        }
        showFlash(tf('exportedAuth', { name: targetLabel, path: result.filePath }), { replace: true });
      });
    });

    deleteBtn.addEventListener('click', async () => {
      const targetLabel = profile.name || profile.id;
      const confirmed = window.confirm(tf('confirmDelete', { name: targetLabel }));
      if (!confirmed) {
        return;
      }

      await runAction(async () => {
        state.data = await window.codexSwitcher.deleteProfile(profile.id);
        renderAll();
        showFlash(tf('deleted', { name: targetLabel }), { replace: true });
      });
    });

    profilesEl.append(card);
  }
}

function renderAll() {
  applyLocale();
  renderCurrentState(state.data);
  renderProfiles(state.data);
  if (!addAccountModalEl.classList.contains('hidden')) {
    renderAddMethod();
  }
}

function openRenameModal(profile) {
  renameModalEl.dataset.profileId = profile.id;
  renameModalEl.dataset.currentName = profile.name || profile.id;
  renameInputEl.value = profile.name || profile.id;
  renameModalEl.classList.remove('hidden');
  renameModalEl.setAttribute('aria-hidden', 'false');
  queueMicrotask(() => {
    renameInputEl.focus();
    renameInputEl.select();
  });
}

function closeRenameModal() {
  renameModalEl.dataset.profileId = '';
  renameModalEl.dataset.currentName = '';
  renameInputEl.value = '';
  renameModalEl.classList.add('hidden');
  renameModalEl.setAttribute('aria-hidden', 'true');
}

function openAddAccountModal() {
  renderAddMethod();
  addAccountModalEl.classList.remove('hidden');
  addAccountModalEl.setAttribute('aria-hidden', 'false');
}

function closeAddAccountModal() {
  addAccountModalEl.classList.add('hidden');
  addAccountModalEl.setAttribute('aria-hidden', 'true');
}

function openCurrentStateModal() {
  state.settingsSection = state.settingsSection || 'config';
  state.settingsDraft = {
    ...DEFAULT_RENDERER_SETTINGS,
    ...(state.data?.settings ?? {}),
    darkMode: state.data?.settings?.darkMode ?? (state.theme === 'dark')
  };
  renderSettings();
  currentStateModalEl.classList.remove('hidden');
  currentStateModalEl.setAttribute('aria-hidden', 'false');
}

function closeCurrentStateModal() {
  state.settingsDraft = null;
  currentStateModalEl.classList.add('hidden');
  currentStateModalEl.setAttribute('aria-hidden', 'true');
}

function openOauthPendingModal() {
  oauthPendingModalEl.classList.remove('hidden');
  oauthPendingModalEl.setAttribute('aria-hidden', 'false');
}

function closeOauthPendingModal() {
  oauthPendingModalEl.classList.add('hidden');
  oauthPendingModalEl.setAttribute('aria-hidden', 'true');
}

async function runAction(action) {
  setBusy(true, 'default');
  try {
    await action();
  } catch (error) {
    showFlash(error.message || String(error), { replace: true, clearQueue: true });
  } finally {
    setBusy(false);
  }
}

async function refreshUsageInBackground({ silent = true, force = false } = {}) {
  if (state.refreshingUsage) {
    return false;
  }

  state.refreshingUsage = true;
  const requestId = state.refreshRequestId + 1;
  state.refreshRequestId = requestId;

  try {
    const refreshedState = await window.codexSwitcher.refreshUsageState(force);
    if (requestId !== state.refreshRequestId) {
      return false;
    }

    state.data = refreshedState;
    renderAll();
    return true;
  } catch (error) {
    if (!silent) {
      showFlash(error.message || String(error));
    }
    return false;
  } finally {
    if (requestId === state.refreshRequestId) {
      state.refreshingUsage = false;
    }
  }
}

async function refreshAllUsage({ silent = false } = {}) {
  if (state.refreshingUsage) {
    return;
  }

  if (!silent) {
    showFlash(t('refreshingUsage'), { replace: true });
  }

  const success = await refreshUsageInBackground({ silent, force: true });

  if (!silent && success) {
    showFlash(t('refreshedUsage'), { replace: true });
  }
}

addAccountBtnEl.addEventListener('click', () => {
  openAddAccountModal();
});

refreshUsageBtnEl.addEventListener('click', async () => {
  await refreshAllUsage({ silent: false });
});

themeToggleBtnEl.addEventListener('click', async () => {
  const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);

  if (!state.data?.settings) {
    return;
  }

  try {
    state.data = await window.codexSwitcher.saveSettings({
      ...state.data.settings,
      darkMode: nextTheme === 'dark'
    });
    renderAll();
  } catch (error) {
    showFlash(error.message || String(error), { replace: true, clearQueue: true });
  }
});

statusBtnEl.addEventListener('click', () => {
  openCurrentStateModal();
});

currentStateModalEl.querySelectorAll('[data-settings-section]').forEach((button) => {
  button.addEventListener('click', () => {
    state.settingsSection = button.dataset.settingsSection;
    renderSettings();
  });
});

addAccountModalEl.querySelectorAll('[data-action="close-add-account"]').forEach((element) => {
  element.addEventListener('click', () => {
    closeAddAccountModal();
  });
});

addAccountModalEl.querySelectorAll('[data-add-method-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    state.addMethod = button.dataset.addMethodTab;
    renderAddMethod();
  });
});

async function startOauthLogin() {
  closeAddAccountModal();
  openOauthPendingModal();
  setBusy(true, 'oauth');
  try {
    state.data = await window.codexSwitcher.createProfileWithOAuth();
    renderAll();
    refreshUsageInBackground();
    showFlash(t('oauthCreated'), { replace: true });
  } catch (error) {
    if (error?.code === 'OAUTH_CANCELLED' || error?.message === '网页登录已取消。') {
      showFlash(t('oauthCancelled'), { replace: true });
      return;
    }
    showFlash(error.message || String(error), { replace: true, clearQueue: true });
  } finally {
    closeOauthPendingModal();
    setBusy(false);
  }
}

addMethodActionBtnEl.addEventListener('click', async () => {
  const method = state.addMethod;

  if (method === 'oauth') {
    await startOauthLogin();
    return;
  }

  if (method === 'current') {
    closeAddAccountModal();
    await runAction(async () => {
      state.data = await window.codexSwitcher.createProfile();
      renderAll();
      refreshUsageInBackground();
      showFlash(t('currentProfileSaved'), { replace: true });
    });
    return;
  }

  if (method === 'import-auth') {
    closeAddAccountModal();
    await runAction(async () => {
      state.data = await window.codexSwitcher.importAuthProfile();
      renderAll();
      refreshUsageInBackground();
      if (state.data.lastAction?.type === 'import-cancelled') {
        showFlash(t('importCancelled'), { replace: true });
        return;
      }
      showFlash(t('importedAuth'), { replace: true });
    });
  }
});

cancelOAuthBtnEl.addEventListener('click', async () => {
  cancelOAuthBtnEl.disabled = true;
  try {
    await window.codexSwitcher.cancelOAuthLogin();
  } finally {
    cancelOAuthBtnEl.disabled = false;
  }
});

currentStateModalEl.querySelectorAll('[data-action="close-current-state"]').forEach((element) => {
  element.addEventListener('click', () => {
    closeCurrentStateModal();
  });
});

restartCodexBtnEl.addEventListener('click', async () => {
  await runAction(async () => {
    state.data = await window.codexSwitcher.restartCodex();
    renderAll();
    refreshUsageInBackground();
    showFlash(t('codexRestarted'), { replace: true });
  });
});

openProfilesBtnEl.addEventListener('click', async () => {
  await window.codexSwitcher.openProfilesFolder();
});

flashCloseBtnEl.addEventListener('click', () => {
  dismissFlash();
});

renameFormEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  const profileId = renameModalEl.dataset.profileId;
  const currentName = renameModalEl.dataset.currentName;
  const newName = renameInputEl.value.trim();

  if (!profileId || !newName || newName === currentName) {
    closeRenameModal();
    return;
  }

  await runAction(async () => {
    state.data = await window.codexSwitcher.renameProfile(profileId, newName);
    closeRenameModal();
    renderAll();
    showFlash(tf('renamed', { name: newName }), { replace: true });
  });
});

renameModalEl.querySelectorAll('[data-action="close-rename"]').forEach((element) => {
  element.addEventListener('click', () => {
    closeRenameModal();
  });
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!renameModalEl.classList.contains('hidden')) {
      closeRenameModal();
    }
    if (!addAccountModalEl.classList.contains('hidden')) {
      closeAddAccountModal();
    }
    if (!currentStateModalEl.classList.contains('hidden')) {
      closeCurrentStateModal();
    }
  }
});

async function boot() {
  initTheme();
  setBusy(true, 'default');
  try {
    state.data = await window.codexSwitcher.loadState();
    if (state.data?.settings) {
      applyTheme(state.data.settings.darkMode ? 'dark' : 'light');
    }
    renderAll();
    refreshUsageInBackground({ silent: true, force: true });
    window.setInterval(() => {
      if (state.busy || state.refreshingUsage) {
        return;
      }
      refreshUsageInBackground({ silent: true, force: true });
    }, AUTO_REFRESH_INTERVAL_MS);
  } catch (error) {
    showFlash(error.message || String(error), { replace: true, clearQueue: true });
  } finally {
    setBusy(false);
  }
}

boot();
