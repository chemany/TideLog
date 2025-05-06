import React, { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Tabs, Tab, Box, Typography, TextField, Button, Alert, CircularProgress } from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';

// TabPanel组件定义
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
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

// a11yProps函数定义
function a11yProps(index) {
  return {
    id: `simple-tab-${index}`,
    'aria-controls': `simple-tabpanel-${index}`,
  };
}

function SettingsPanel({ open, onClose, refreshEvents }) {
  const [tabValue, setTabValue] = useState(0);

  // LLM设置状态
  const [llmSettings, setLlmSettings] = useState({
    provider: 'none',
    apiKey: '',
    model: '',
    baseUrl: ''
  });
  
  // Exchange设置状态
  const [exchangeSettings, setExchangeSettings] = useState({
    email: '',
    password: '',
    serverUrl: ''
  });
  const [isSyncingExchange, setIsSyncingExchange] = useState(false);
  const [exchangeMessage, setExchangeMessage] = useState('');
  const [exchangeError, setExchangeError] = useState('');
  
  // IMAP设置状态
  const [imapSettings, setImapSettings] = useState({
    email: '',
    password: '',
    imapHost: '',
    imapPort: '993',
    useTLS: true
  });
  const [isSyncingIMAP, setIsSyncingIMAP] = useState(false);
  const [imapMessage, setImapMessage] = useState('');
  const [imapError, setImapError] = useState('');

  // CalDAV设置状态
  const [caldavSettings, setCaldavSettings] = useState({
    username: '',
    password: '',
    serverUrl: ''
  });
  const [isSyncingCalDAV, setIsSyncingCalDAV] = useState(false);
  const [caldavMessage, setCaldavMessage] = useState('');
  const [caldavError, setCaldavError] = useState('');

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };
  
  // 加载LLM设置
  const loadLLMSettings = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8001/config/llm');
      const data = await response.json();
      
      if (response.ok) {
        setLlmSettings({
          provider: data.provider || 'none',
          apiKey: data.apiKey || '',
          model: data.model || '',
          baseUrl: data.baseUrl || ''
        });
      }
    } catch (error) {
      console.error('加载LLM设置失败:', error);
    }
  }, []);
  
  // 保存LLM设置
  const handleSaveLLMSettings = async () => {
    try {
      const response = await fetch('http://localhost:8001/config/llm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(llmSettings)
      });
      
      if (response.ok) {
        alert('LLM设置已保存');
      } else {
        alert('保存LLM设置失败');
      }
    } catch (error) {
      alert('保存LLM设置时出错: ' + error.message);
    }
  };
  
  // 加载Exchange设置
  const loadExchangeSettings = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8001/config/exchange');
      const data = await response.json();
      
      if (response.ok) {
        setExchangeSettings({
          email: data.email || '',
          password: '', // 不从后端加载密码
          serverUrl: data.serverUrl || ''
        });
      }
    } catch (error) {
      console.error('加载Exchange设置失败:', error);
    }
  }, []);
  
  // 保存Exchange设置
  const handleSaveExchangeSettings = async () => {
    try {
      setExchangeMessage('');
      setExchangeError('');
      
      const response = await fetch('http://localhost:8001/config/exchange', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(exchangeSettings)
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setExchangeMessage('Exchange设置已保存');
      } else {
        setExchangeError(data.error || '保存Exchange设置失败');
      }
    } catch (error) {
      setExchangeError('保存Exchange设置时出错: ' + error.message);
    }
  };
  
  // 同步Exchange
  const handleSyncExchange = async () => {
    try {
      setExchangeMessage('');
      setExchangeError('');
      setIsSyncingExchange(true);

      // --- 根据邮箱地址选择同步 URL ---
      const email = exchangeSettings.email.toLowerCase();
      let syncUrl = '';
      let syncType = '';

      if (email.endsWith('@qq.com')) {
        // syncUrl = 'http://localhost:8001/sync/exchange'; // 或 /sync/qq-ews-python
        // 暂时保留 /sync/exchange, 因为后端当前是用这个路由触发 Python
        syncUrl = 'http://localhost:8001/sync/exchange'; 
        syncType = 'QQ EWS (Python)';
        console.log('前端检测到 QQ 邮箱，将调用', syncUrl);
      } else {
        syncUrl = 'http://localhost:8001/sync/outlook-ews';
        syncType = 'Outlook/Standard EWS';
        console.log('前端检测到非 QQ 邮箱，将调用', syncUrl);
      }
      // --------------------------------

      // 使用确定的 URL 发起请求
      const response = await fetch(syncUrl, {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setExchangeMessage(`同步 (${syncType}) 成功: ${data.message || '已同步日历'}`);
        if (refreshEvents) {
          refreshEvents();
        }
      } else {
        // 尝试从 data.details 中获取更详细的错误信息 (如果存在)
        let errorDetails = data.error || `同步 (${syncType}) 失败`;
        if (data.details && Array.isArray(data.details)) {
            errorDetails += ' Details: ' + data.details.join('; ');
        } else if (data.details && typeof data.details === 'object') {
             // 尝试提取嵌套错误
             errorDetails += ` (${data.details.message || JSON.stringify(data.details)})`;
        } else if (typeof data.details === 'string') {
             errorDetails += `: ${data.details}`;
        }
        setExchangeError(errorDetails);
      }
    } catch (error) {
      setExchangeError(`同步Exchange时出错: ${error.message}`);
    } finally {
      setIsSyncingExchange(false);
    }
  };
  
  // 加载IMAP设置
  const loadImapSettings = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8001/config/imap');
      const data = await response.json();
      
      if (response.ok) {
        setImapSettings({
          email: data.email || '',
          password: '', // 不从后端加载密码
          imapHost: data.imapHost || '',
          imapPort: data.imapPort || '993',
          useTLS: data.useTLS !== false
        });
      }
    } catch (error) {
      console.error('加载IMAP设置失败:', error);
    }
  }, []);
  
  // 保存IMAP设置
  const handleSaveImapSettings = async () => {
    try {
      setImapMessage('');
      setImapError('');
      
      const response = await fetch('http://localhost:8001/config/imap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(imapSettings)
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setImapMessage('IMAP设置已保存');
      } else {
        setImapError(data.error || '保存IMAP设置失败');
      }
    } catch (error) {
      setImapError('保存IMAP设置时出错: ' + error.message);
    }
  };
  
  // 同步IMAP
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

  // 加载CalDAV设置
  const loadCalDAVSettings = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8001/config/caldav');
      const data = await response.json();

      if (response.ok) {
        setCaldavSettings({
          username: data.username || '',
          password: '', // 不从后端加载密码
          serverUrl: data.serverUrl || ''
        });
      }
    } catch (error) {
      console.error('加载CalDAV设置失败:', error);
    }
  }, []);

  // 保存CalDAV设置
  const handleSaveCalDAVSettings = async () => {
    try {
      setCaldavMessage('');
      setCaldavError('');

      const response = await fetch('http://localhost:8001/config/caldav', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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

  // 同步CalDAV日历
  const handleSyncCalDAV = async () => {
    try {
      setCaldavMessage('');
      setCaldavError('');
      setIsSyncingCalDAV(true);

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

  // 加载所有设置
  useEffect(() => {
    if (open) {
      loadLLMSettings();
      loadExchangeSettings();
      loadImapSettings();
      loadCalDAVSettings();
    }
  }, [open, loadLLMSettings, loadExchangeSettings, loadImapSettings, loadCalDAVSettings]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>设置</DialogTitle>
      <DialogContent>
        <Box sx={{ width: '100%' }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={tabValue} onChange={handleTabChange}>
              <Tab label="LLM设置" {...a11yProps(0)} />
              <Tab label="Exchange" {...a11yProps(1)} />
              <Tab label="IMAP" {...a11yProps(2)} />
              <Tab label="CalDAV" {...a11yProps(3)} />
            </Tabs>
          </Box>

          {/* LLM设置选项卡 */}
          <TabPanel value={tabValue} index={0}>
            <Typography variant="h6" gutterBottom>
              LLM 设置
            </Typography>
            
            <TextField
              label="提供商"
              select
              variant="outlined"
              fullWidth
              margin="normal"
              value={llmSettings.provider}
              onChange={(e) => setLlmSettings({ ...llmSettings, provider: e.target.value })}
              SelectProps={{ native: true }}
            >
              <option value="none">不使用LLM</option>
              <option value="openai">OpenAI</option>
              <option value="deepseek">DeepSeek</option>
              <option value="custom">自定义</option>
            </TextField>
            
            {llmSettings.provider !== 'none' && (
              <>
                <TextField
                  label="API密钥"
                  type="password"
                  variant="outlined"
                  fullWidth
                  margin="normal"
                  value={llmSettings.apiKey}
                  onChange={(e) => setLlmSettings({ ...llmSettings, apiKey: e.target.value })}
                />
                
                <TextField
                  label="模型名称"
                  variant="outlined"
                  fullWidth
                  margin="normal"
                  value={llmSettings.model}
                  onChange={(e) => setLlmSettings({ ...llmSettings, model: e.target.value })}
                  helperText={`例如: ${llmSettings.provider === 'openai' ? 'gpt-4-turbo' : llmSettings.provider === 'deepseek' ? 'deepseek-chat' : '自定义模型名称'}`}
                />
                
                {llmSettings.provider === 'custom' && (
                  <TextField
                    label="基础URL"
                    variant="outlined"
                    fullWidth
                    margin="normal"
                    value={llmSettings.baseUrl}
                    onChange={(e) => setLlmSettings({ ...llmSettings, baseUrl: e.target.value })}
                    helperText="自定义LLM提供商的API基础URL"
                  />
                )}
              </>
            )}
            
            <Button
              variant="contained"
              color="primary"
              onClick={handleSaveLLMSettings}
              sx={{ mt: 2 }}
            >
              保存LLM设置
            </Button>
          </TabPanel>

          {/* Exchange选项卡 */}
          <TabPanel value={tabValue} index={1}>
            <Typography variant="h6" gutterBottom>
              Exchange 设置
            </Typography>
            
            <Typography variant="body2" color="textSecondary" paragraph>
              配置Exchange邮箱的连接信息，用于同步日历事件。
            </Typography>
            
            <TextField
              label="邮箱地址"
              variant="outlined"
              fullWidth
              margin="normal"
              value={exchangeSettings.email}
              onChange={(e) => setExchangeSettings({ ...exchangeSettings, email: e.target.value })}
            />
            
            <TextField
              label="密码"
              type="password"
              variant="outlined"
              fullWidth
              margin="normal"
              value={exchangeSettings.password}
              onChange={(e) => setExchangeSettings({ ...exchangeSettings, password: e.target.value })}
            />
            
            <TextField
              label="服务器URL (可选)"
              variant="outlined"
              fullWidth
              margin="normal"
              value={exchangeSettings.serverUrl}
              onChange={(e) => setExchangeSettings({ ...exchangeSettings, serverUrl: e.target.value })}
              helperText="例如: https://outlook.office365.com/EWS/Exchange.asmx"
            />
            
            <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleSaveExchangeSettings}
              >
                保存设置
              </Button>
              
              <Button
                variant="contained"
                color="secondary"
                onClick={handleSyncExchange}
                disabled={isSyncingExchange}
                startIcon={isSyncingExchange ? <CircularProgress size={20} /> : <SyncIcon />}
              >
                {isSyncingExchange ? '同步中...' : '立即同步'}
              </Button>
            </Box>
            
            {exchangeMessage && (
              <Alert severity="success" sx={{ mt: 2 }}>
                {exchangeMessage}
              </Alert>
            )}
            
            {exchangeError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {exchangeError}
              </Alert>
            )}
          </TabPanel>

          {/* IMAP选项卡 */}
          <TabPanel value={tabValue} index={2}>
            <Typography variant="h6" gutterBottom>
              IMAP 设置
            </Typography>
            
            <Typography variant="body2" color="textSecondary" paragraph>
              配置IMAP邮箱连接，用于从邮件中提取日历事件。
            </Typography>
            
            <TextField
              label="邮箱地址"
              variant="outlined"
              fullWidth
              margin="normal"
              value={imapSettings.email}
              onChange={(e) => setImapSettings({ ...imapSettings, email: e.target.value })}
            />
            
            <TextField
              label="密码/授权码"
              type="password"
              variant="outlined"
              fullWidth
              margin="normal"
              value={imapSettings.password}
              onChange={(e) => setImapSettings({ ...imapSettings, password: e.target.value })}
              helperText="有些邮箱服务需要使用授权码而非密码"
            />
            
            <TextField
              label="IMAP服务器"
              variant="outlined"
              fullWidth
              margin="normal"
              value={imapSettings.imapHost}
              onChange={(e) => setImapSettings({ ...imapSettings, imapHost: e.target.value })}
              helperText="例如: imap.gmail.com, imap.qq.com"
            />
            
            <TextField
              label="端口"
              variant="outlined"
              type="number"
              fullWidth
              margin="normal"
              value={imapSettings.imapPort}
              onChange={(e) => setImapSettings({ ...imapSettings, imapPort: e.target.value })}
              helperText="通常为993(SSL)或143(非SSL)"
            />
            
            <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleSaveImapSettings}
              >
                保存设置
              </Button>
              
              <Button
                variant="contained"
                color="secondary"
                onClick={handleSyncImap}
                disabled={isSyncingIMAP}
                startIcon={isSyncingIMAP ? <CircularProgress size={20} /> : <SyncIcon />}
              >
                {isSyncingIMAP ? '同步中...' : '立即同步'}
              </Button>
            </Box>
            
            {imapMessage && (
              <Alert severity="success" sx={{ mt: 2 }}>
                {imapMessage}
              </Alert>
            )}
            
            {imapError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {imapError}
              </Alert>
            )}
          </TabPanel>

          {/* CalDAV选项卡 */}
          <TabPanel value={tabValue} index={3}>
            <Typography variant="h6" gutterBottom>
              CalDAV 设置
            </Typography>

            <Typography variant="body2" color="textSecondary" paragraph>
              CalDAV是一个标准的日历同步协议，可用于同步QQ邮箱、iCloud、Google Calendar等日历服务。对于QQ邮箱，服务器地址通常为"caldav.exmail.qq.com"。
            </Typography>

            <TextField
              label="用户名"
              variant="outlined"
              fullWidth
              margin="normal"
              value={caldavSettings.username}
              onChange={(e) => setCaldavSettings({ ...caldavSettings, username: e.target.value })}
              helperText="完整的邮箱地址，例如 user@qq.com"
            />

            <TextField
              label="密码"
              type="password"
              variant="outlined"
              fullWidth
              margin="normal"
              value={caldavSettings.password}
              onChange={(e) => setCaldavSettings({ ...caldavSettings, password: e.target.value })}
              helperText="邮箱密码或授权码"
            />

            <TextField
              label="服务器URL"
              variant="outlined"
              fullWidth
              margin="normal"
              value={caldavSettings.serverUrl}
              onChange={(e) => setCaldavSettings({ ...caldavSettings, serverUrl: e.target.value })}
              helperText="CalDAV服务器地址，例如 https://caldav.exmail.qq.com"
            />

            <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleSaveCalDAVSettings}
              >
                保存设置
              </Button>

              <Button
                variant="contained"
                color="secondary"
                onClick={handleSyncCalDAV}
                disabled={isSyncingCalDAV}
                startIcon={isSyncingCalDAV ? <CircularProgress size={20} /> : <SyncIcon />}
              >
                {isSyncingCalDAV ? '同步中...' : '立即同步'}
              </Button>
            </Box>

            {caldavMessage && (
              <Alert severity="success" sx={{ mt: 2 }}>
                {caldavMessage}
              </Alert>
            )}

            {caldavError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {caldavError}
              </Alert>
            )}
          </TabPanel>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
}

export default SettingsPanel; 