import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Tabs, Tab, Box, TextField, Typography, CircularProgress, Alert, Divider
} from '@mui/material';

// Helper function for TabPanel accessibility
function a11yProps(index) {
  return {
    id: `setting-tab-${index}`,
    'aria-controls': `setting-tabpanel-${index}`,
  };
}

// TabPanel component
function TabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`setting-tabpanel-${index}`}
      aria-labelledby={`setting-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const SettingsPanel = ({ open, onClose, refreshEvents }) => {
  const [tabValue, setTabValue] = useState(0);

  // LLM Settings State
  const [llmSettings, setLlmSettings] = useState({ provider: 'none', api_key: '', base_url: '', model_name: '' });
  const [llmMessage, setLlmMessage] = useState('');
  const [llmError, setLlmError] = useState('');

  // Exchange Settings State
  const [exchangeSettings, setExchangeSettings] = useState({ email: '', password: '', ewsUrl: '', exchangeVersion: 'Exchange2013' });
  const [exchangeMessage, setExchangeMessage] = useState('');
  const [exchangeError, setExchangeError] = useState('');
  const [isSyncingExchange, setIsSyncingExchange] = useState(false);

  // IMAP Settings State
  const [imapSettings, setImapSettings] = useState({ email: '', password: '', imapHost: '', imapPort: 993, useTLS: true });
  const [imapMessage, setImapMessage] = useState('');
  const [imapError, setImapError] = useState('');
  const [isSyncingIMAP, setIsSyncingIMAP] = useState(false);
  // --- 新增：IMAP Filter State ---
  const [imapAllowlist, setImapAllowlist] = useState(''); // 使用字符串，每行一个邮箱
  const [imapFilterMessage, setImapFilterMessage] = useState('');
  const [imapFilterError, setImapFilterError] = useState('');
  // -------------------------------

  // CalDAV Settings State
  const [caldavSettings, setCaldavSettings] = useState({ username: '', password: '', serverUrl: '' });
  const [caldavMessage, setCaldavMessage] = useState('');
  const [caldavError, setCaldavError] = useState('');
  const [isSyncingCalDAV, setIsSyncingCalDAV] = useState(false);


  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  // --- LLM Settings Handlers ---
  const loadLLMSettings = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8001/config/llm');
      const data = await response.json();
      if (response.ok) {
        setLlmSettings(prev => ({
          ...prev, // Keep potentially unsaved API key if user typed one
          provider: data.provider || 'none',
          base_url: data.base_url || '',
          model_name: data.model_name || '',
          // Don't load api_key from backend for security
        }));
      } else {
        console.error("加载LLM设置失败:", data.error);
      }
    } catch (error) {
      console.error("加载LLM设置时出错:", error);
    }
  }, []);

  const handleSaveLLMSettings = async () => {
    setLlmMessage('');
    setLlmError('');
    try {
      const response = await fetch('http://localhost:8001/config/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(llmSettings)
      });
      const data = await response.json();
      if (response.ok) {
        setLlmMessage(data.message || 'LLM设置已保存。');
      } else {
        setLlmError(data.error || '保存LLM设置失败。');
      }
    } catch (error) {
      setLlmError('保存LLM设置时出错: ' + error.message);
    }
  };

  // --- Exchange Settings Handlers ---
  const loadExchangeSettings = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8001/config/exchange');
      const data = await response.json();
      if (response.ok) {
        setExchangeSettings(prev => ({
          ...prev, // Keep password if user typed one
          email: data.email || '',
          ewsUrl: data.ewsUrl || '',
          exchangeVersion: data.exchangeVersion || 'Exchange2013'
        }));
      } else {
        console.error("加载Exchange设置失败:", data.error);
      }
    } catch (error) {
      console.error("加载Exchange设置时出错:", error);
    }
  }, []);

  const handleSaveExchangeSettings = async () => {
    setExchangeMessage('');
    setExchangeError('');
    try {
      const response = await fetch('http://localhost:8001/config/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exchangeSettings)
      });
      const data = await response.json();
      if (response.ok) {
        setExchangeMessage(data.message || 'Exchange设置已保存。');
      } else {
        setExchangeError(data.error || '保存Exchange设置失败。');
      }
    } catch (error) {
      setExchangeError('保存Exchange设置时出错: ' + error.message);
    }
  };

  const handleSyncExchange = async () => {
    setExchangeMessage('');
    setExchangeError('');
    setIsSyncingExchange(true);
    let syncUrl = '';
    let accountType = '';

    // Determine the correct sync URL based on email type
    if (exchangeSettings.email.toLowerCase().endsWith('@qq.com')) {
      // syncUrl = 'http://localhost:8001/sync/exchange'; // Legacy QQ EWS Python (if still used)
      syncUrl = 'http://localhost:8001/sync/qq-eas'; // Prefer QQ EAS Node.js version
      accountType = 'QQ EAS';
    } else {
      syncUrl = 'http://localhost:8001/sync/outlook-ews'; // Standard EWS Node.js version
      accountType = 'Outlook/Exchange EWS';
    }

    console.log(`[Sync Button] Attempting to sync ${accountType} for ${exchangeSettings.email} via ${syncUrl}`);

    try {
      const response = await fetch(syncUrl, { method: 'POST' });
      const data = await response.json();

      if (response.ok) {
        setExchangeMessage(`同步成功 (${accountType}): ${data.message || '已同步'}`);
        if (refreshEvents) {
          refreshEvents(); // Refresh calendar events on successful sync
        }
      } else {
        setExchangeError(`同步失败 (${accountType}): ${data.error || response.statusText}`);
      }
    } catch (error) {
      setExchangeError(`同步时出错 (${accountType}): ${error.message}`);
    } finally {
      setIsSyncingExchange(false);
    }
  };


  // --- IMAP Settings Handlers ---
  const loadImapSettings = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8001/config/imap');
      const data = await response.json();
      if (response.ok) {
        setImapSettings(prev => ({
          ...prev,
          email: data.email || '',
          imapHost: data.imapHost || '',
          imapPort: data.imapPort || 993,
          useTLS: data.useTLS !== false, // Default to true if missing
        }));
      } else {
        console.error("加载IMAP设置失败:", data.error);
      }
    } catch (error) {
      console.error("加载IMAP设置时出错:", error);
    }
  }, []);

  const handleSaveImapSettings = async () => {
    setImapMessage('');
    setImapError('');
    try {
      const response = await fetch('http://localhost:8001/config/imap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imapSettings)
      });
      const data = await response.json();
      if (response.ok) {
        setImapMessage(data.message || 'IMAP设置已保存。');
      } else {
        setImapError(data.error || '保存IMAP设置失败。');
      }
    } catch (error) {
      setImapError('保存IMAP设置时出错: ' + error.message);
    }
  };

  const handleSyncImap = async () => {
    try {
      setImapMessage('');
      setImapError('');
      setIsSyncingIMAP(true);

      const response = await fetch('http://localhost:8001/sync/imap', {
        method: 'POST'
      });

      const data = await response.json();

      if (response.ok) {
        setImapMessage(`同步成功: ${data.message || '已同步IMAP邮件中的日历事件'}`);
        if (refreshEvents) {
          refreshEvents();
        }
      } else {
        setImapError(data.error || '同步IMAP邮件失败');
      }
    } catch (error) {
      setImapError('同步IMAP时出错: ' + error.message);
    } finally {
      setIsSyncingIMAP(false);
    }
  };

  // --- 新增：IMAP Filter Handlers ---
  const loadImapFilterSettings = useCallback(async () => {
      try {
          const response = await fetch('http://localhost:8001/config/imap-filter');
          const data = await response.json();
          if (response.ok && data.sender_allowlist) {
              // 将数组转换为换行分隔的字符串用于 TextField
              setImapAllowlist(data.sender_allowlist.join('\n'));
          } else {
              console.error('Failed to load IMAP filter settings:', data?.error || 'Unknown error');
          }
      } catch (error) {
          console.error('Error loading IMAP filter settings:', error);
      }
  }, []); // 依赖为空

  const handleSaveImapFilterSettings = async () => {
      setImapFilterMessage('');
      setImapFilterError('');
      try {
          // 将 TextField 的字符串转换回数组，过滤空行和空白
          const allowlistArray = imapAllowlist.split('\n').map(e => e.trim()).filter(Boolean);
          const response = await fetch('http://localhost:8001/config/imap-filter', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sender_allowlist: allowlistArray })
          });
          const data = await response.json();
          if (response.ok) {
              setImapFilterMessage(data.message || 'IMAP 发件人白名单已更新。');
          } else {
              setImapFilterError(data.error || '更新 IMAP 白名单失败。');
          }
      } catch (error) {
          setImapFilterError('更新 IMAP 白名单时出错: ' + error.message);
      }
  };
  // ---------------------------------


  // --- CalDAV Settings Handlers ---
  const loadCalDAVSettings = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8001/config/caldav');
      const data = await response.json();
      if (response.ok) {
        setCaldavSettings(prev => ({
          ...prev,
          username: data.username || '',
          serverUrl: data.serverUrl || ''
          // 不加载密码
        }));
      } else {
        console.error("加载CalDAV设置失败:", data.error);
      }
    } catch (error) {
      console.error('加载CalDAV设置失败:', error);
    }
  }, []);

  const handleSaveCalDAVSettings = async () => {
    setCaldavMessage('');
    setCaldavError('');
    try {
      const response = await fetch('http://localhost:8001/config/caldav', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(caldavSettings)
      });
      const data = await response.json();
      if (response.ok) {
        setCaldavMessage('CalDAV设置已保存');
      } else {
        setCaldavError(data.error || '保存CalDAV设置失败');
      }
    } catch (error) {
      setCaldavError('保存CalDAV设置时出错: ' + error.message);
    }
  };

  const handleSyncCalDAV = async () => {
    setCaldavMessage('');
    setCaldavError('');
    setIsSyncingCalDAV(true);
    try {
      const response = await fetch('http://localhost:8001/sync/caldav', {
        method: 'POST'
      });
      const data = await response.json();
      if (response.ok) {
        setCaldavMessage(`同步成功: ${data.message || '已同步CalDAV日历'}`);
        if (refreshEvents) {
          refreshEvents();
        }
      } else {
        setCaldavError(data.error || '同步CalDAV日历失败');
      }
    } catch (error) {
      setCaldavError('同步CalDAV日历时出错: ' + error.message);
    } finally {
      setIsSyncingCalDAV(false);
    }
  };

  // --- Load All Settings on Open ---
  useEffect(() => {
    if (open) {
      loadLLMSettings();
      loadExchangeSettings();
      loadImapSettings();
      loadImapFilterSettings(); // <-- 加载 IMAP Filter 设置
      loadCalDAVSettings();
    }
  }, [open, loadLLMSettings, loadExchangeSettings, loadImapSettings, loadImapFilterSettings, loadCalDAVSettings]); // <-- 添加依赖

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle>设置</DialogTitle>
      <DialogContent dividers={true}>
        <Box sx={{ width: '100%' }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={tabValue} onChange={handleTabChange} aria-label="设置选项卡">
              <Tab label="LLM设置" {...a11yProps(0)} />
              <Tab label="Exchange" {...a11yProps(1)} />
              <Tab label="IMAP" {...a11yProps(2)} />
              <Tab label="CalDAV" {...a11yProps(3)} />
            </Tabs>
          </Box>

          {/* LLM Settings Panel */}
          <TabPanel value={tabValue} index={0}>
            <Typography variant="h6" gutterBottom>大语言模型 (LLM) 设置</Typography>
            <TextField
              select
              label="选择供应商"
              value={llmSettings.provider}
              onChange={(e) => setLlmSettings({ ...llmSettings, provider: e.target.value })}
              fullWidth
              margin="normal"
              SelectProps={{ native: true }}
            >
              <option value="none">不使用</option>
              <option value="openai">OpenAI</option>
              <option value="deepseek">DeepSeek</option>
              {/* Add other providers here */}
            </TextField>
            {(llmSettings.provider === 'openai' || llmSettings.provider === 'deepseek') && (
              <>
                <TextField
                  label="API Key"
                  type="password"
                  value={llmSettings.api_key}
                  onChange={(e) => setLlmSettings({ ...llmSettings, api_key: e.target.value })}
                  fullWidth
                  margin="normal"
                  helperText={llmSettings.provider === 'deepseek' ? "对于DeepSeek, 请在此处输入API Key" : "请输入您的OpenAI API Key"}
                />
                <TextField
                  label="Base URL (可选)"
                  value={llmSettings.base_url}
                  onChange={(e) => setLlmSettings({ ...llmSettings, base_url: e.target.value })}
                  fullWidth
                  margin="normal"
                  placeholder={llmSettings.provider === 'deepseek' ? "https://api.deepseek.com/v1" : "例如 OpenAI 或兼容 API 的代理地址"}
                  helperText="留空则使用官方默认地址。"
                />
                 <TextField
                  label="模型名称 (可选)"
                  value={llmSettings.model_name}
                  onChange={(e) => setLlmSettings({ ...llmSettings, model_name: e.target.value })}
                  fullWidth
                  margin="normal"
                  placeholder={llmSettings.provider === 'deepseek' ? "deepseek-chat" : "gpt-3.5-turbo"}
                  helperText="留空则使用供应商推荐的默认模型。"
                />
              </>
            )}
            <Button onClick={handleSaveLLMSettings} variant="contained" sx={{ mt: 2 }}>保存LLM设置</Button>
            {llmMessage && <Alert severity="success" sx={{ mt: 2 }}>{llmMessage}</Alert>}
            {llmError && <Alert severity="error" sx={{ mt: 2 }}>{llmError}</Alert>}
          </TabPanel>

          {/* Exchange Settings Panel */}
          <TabPanel value={tabValue} index={1}>
            <Typography variant="h6" gutterBottom>Exchange / Outlook 设置</Typography>
            <TextField
              label="邮箱地址"
              type="email"
              value={exchangeSettings.email}
              onChange={(e) => setExchangeSettings({ ...exchangeSettings, email: e.target.value })}
              fullWidth
              margin="normal"
            />
            <TextField
              label="密码或授权码"
              type="password"
              value={exchangeSettings.password}
              onChange={(e) => setExchangeSettings({ ...exchangeSettings, password: e.target.value })}
              fullWidth
              margin="normal"
              helperText="对于某些服务(如QQ邮箱)，可能需要输入授权码。"
            />
            <TextField
              label="EWS URL (可选)"
              value={exchangeSettings.ewsUrl}
              onChange={(e) => setExchangeSettings({ ...exchangeSettings, ewsUrl: e.target.value })}
              fullWidth
              margin="normal"
              placeholder="例如 https://outlook.office365.com/EWS/Exchange.asmx"
              helperText="留空则尝试自动发现 (Autodiscover)。"
            />
             <TextField
              label="Exchange 版本 (可选)"
              value={exchangeSettings.exchangeVersion}
              onChange={(e) => setExchangeSettings({ ...exchangeSettings, exchangeVersion: e.target.value })}
              fullWidth
              margin="normal"
              helperText="默认为 Exchange2013。根据需要调整。"
            />
            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                <Button onClick={handleSaveExchangeSettings} variant="contained">保存Exchange设置</Button>
                <Button
                  onClick={handleSyncExchange}
                  variant="outlined"
                  disabled={isSyncingExchange || !exchangeSettings.email || !exchangeSettings.password}
                  startIcon={isSyncingExchange ? <CircularProgress size={20} /> : null}
                >
                  {isSyncingExchange ? '同步中...' : '立即同步Exchange/Outlook'}
                </Button>
            </Box>
            {exchangeMessage && <Alert severity="success" sx={{ mt: 2 }}>{exchangeMessage}</Alert>}
            {exchangeError && <Alert severity="error" sx={{ mt: 2 }}>{exchangeError}</Alert>}
          </TabPanel>

          {/* IMAP Settings Panel */}
          <TabPanel value={tabValue} index={2}>
            <Typography variant="h6" gutterBottom>IMAP 设置</Typography>
            <TextField
              label="邮箱地址"
              type="email"
              value={imapSettings.email}
              onChange={(e) => setImapSettings({ ...imapSettings, email: e.target.value })}
              fullWidth
              margin="normal"
            />
            <TextField
              label="密码或授权码"
              type="password"
              value={imapSettings.password}
              onChange={(e) => setImapSettings({ ...imapSettings, password: e.target.value })}
              fullWidth
              margin="normal"
              helperText="通常需要输入邮箱服务商生成的授权码。"
            />
            <TextField
              label="IMAP 服务器地址"
              value={imapSettings.imapHost}
              onChange={(e) => setImapSettings({ ...imapSettings, imapHost: e.target.value })}
              fullWidth
              margin="normal"
              placeholder="例如 imap.qq.com 或 imap.gmail.com"
            />
            <TextField
              label="IMAP 端口"
              type="number"
              value={imapSettings.imapPort}
              onChange={(e) => setImapSettings({ ...imapSettings, imapPort: parseInt(e.target.value, 10) || 993 })}
              margin="normal"
              sx={{ mr: 2 }}
            />
            <TextField
              select
              label="使用 TLS"
              value={imapSettings.useTLS}
              onChange={(e) => setImapSettings({ ...imapSettings, useTLS: e.target.value === 'true' })}
              margin="normal"
              SelectProps={{ native: true }}
              helperText="通常应启用"
            >
              <option value="true">是</option>
              <option value="false">否</option>
            </TextField>
            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
              <Button onClick={handleSaveImapSettings} variant="contained">保存IMAP设置</Button>
              <Button
                onClick={handleSyncImap}
                variant="outlined"
                disabled={isSyncingIMAP || !imapSettings.email || !imapSettings.password || !imapSettings.imapHost}
                startIcon={isSyncingIMAP ? <CircularProgress size={20} /> : null}
              >
                {isSyncingIMAP ? '同步中...' : '立即同步IMAP'}
              </Button>
            </Box>
            {imapMessage && <Alert severity="success" sx={{ mt: 2 }}>{imapMessage}</Alert>}
            {imapError && <Alert severity="error" sx={{ mt: 2 }}>{imapError}</Alert>}

            {/* --- 新增：IMAP Filter Section --- */}
            <Divider sx={{ my: 3 }} />
            <Typography variant="h6" gutterBottom>IMAP 邮件解析白名单</Typography>
            <Typography variant="body2" color="textSecondary" gutterBottom>
              只有以下列表中的发件人邮件才会被尝试使用 LLM 解析内容以创建日程。每行一个邮箱地址。
            </Typography>
            <TextField
              label="发件人白名单 (每行一个)"
              multiline
              rows={4}
              fullWidth
              value={imapAllowlist}
              onChange={(e) => setImapAllowlist(e.target.value)}
              variant="outlined"
              margin="normal"
              InputProps={{ style: { fontFamily: 'monospace' } }} // Use monospace for better email alignment
            />
            <Button onClick={handleSaveImapFilterSettings} variant="contained" sx={{ mt: 1 }}>
              保存白名单
            </Button>
            {imapFilterMessage && <Alert severity="success" sx={{ mt: 2 }}>{imapFilterMessage}</Alert>}
            {imapFilterError && <Alert severity="error" sx={{ mt: 2 }}>{imapFilterError}</Alert>}
            {/* --------------------------------- */}

          </TabPanel>

          {/* CalDAV Settings Panel */}
          <TabPanel value={tabValue} index={3}>
             <Typography variant="h6" gutterBottom>CalDAV 设置</Typography>
             <TextField
              label="服务器地址"
              value={caldavSettings.serverUrl}
              onChange={(e) => setCaldavSettings({ ...caldavSettings, serverUrl: e.target.value })}
              fullWidth
              margin="normal"
              placeholder="例如 dav.qq.com 或 caldav.feishu.cn"
            />
             <TextField
              label="用户名"
              value={caldavSettings.username}
              onChange={(e) => setCaldavSettings({ ...caldavSettings, username: e.target.value })}
              fullWidth
              margin="normal"
              helperText="通常是完整的邮箱地址。"
            />
            <TextField
              label="密码或应用专用密码"
              type="password"
              value={caldavSettings.password}
              onChange={(e) => setCaldavSettings({ ...caldavSettings, password: e.target.value })}
              fullWidth
              margin="normal"
              helperText="对于某些服务(如飞书、QQ)，可能需要生成专用的密码。"
            />
            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
              <Button onClick={handleSaveCalDAVSettings} variant="contained">保存CalDAV设置</Button>
              <Button
                onClick={handleSyncCalDAV}
                variant="outlined"
                disabled={isSyncingCalDAV || !caldavSettings.username || !caldavSettings.password || !caldavSettings.serverUrl}
                startIcon={isSyncingCalDAV ? <CircularProgress size={20} /> : null}
              >
                {isSyncingCalDAV ? '同步中...' : '立即同步CalDAV'}
              </Button>
            </Box>
            {caldavMessage && <Alert severity="success" sx={{ mt: 2 }}>{caldavMessage}</Alert>}
            {caldavError && <Alert severity="error" sx={{ mt: 2 }}>{caldavError}</Alert>}
          </TabPanel>

        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
};

export default SettingsPanel;