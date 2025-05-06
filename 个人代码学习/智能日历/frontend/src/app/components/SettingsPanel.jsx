import React, { useState, useEffect } from 'react';
import { 
  Tabs, Tab, Box, TextField, Button, Switch, FormControlLabel, 
  Typography, Paper, Divider, InputAdornment, FormControl, 
  InputLabel, Select, MenuItem, IconButton, Modal
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import SyncIcon from '@mui/icons-material/Sync';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CloseIcon from '@mui/icons-material/Close';

/**
 * 统一的设置面板组件
 * 提供LLM、Exchange和IMAP设置选项
 */
export default function SettingsPanel({ onClose }) {
  // 标签页状态
  const [currentTab, setCurrentTab] = useState(0);

  // LLM设置
  const [llmSettings, setLlmSettings] = useState({
    provider: 'none',
    apiKey: '',
    model: '',
    baseUrl: ''
  });

  // Exchange设置
  const [exchangeSettings, setExchangeSettings] = useState({
    email: '',
    password: '',
    serverUrl: '',
    active: false
  });

  // IMAP设置
  const [imapSettings, setImapSettings] = useState({
    email: '',
    password: '',
    imapHost: '',
    imapPort: 993,
    useTLS: true,
    active: false
  });

  // 密码可见性状态
  const [showPasswords, setShowPasswords] = useState({
    llm: false,
    exchange: false,
    imap: false
  });

  // 加载设置
  useEffect(() => {
    // 加载LLM设置
    fetch('http://localhost:8001/config/llm')
      .then(res => res.json())
      .then(data => {
        setLlmSettings(data);
      })
      .catch(err => console.error('无法加载LLM设置:', err));

    // 加载Exchange设置
    fetch('http://localhost:8001/config/exchange')
      .then(res => res.json())
      .then(data => {
        setExchangeSettings(data);
      })
      .catch(err => console.error('无法加载Exchange设置:', err));

    // 加载IMAP设置
    fetch('http://localhost:8001/config/imap')
      .then(res => res.json())
      .then(data => {
        setImapSettings(data);
      })
      .catch(err => console.error('无法加载IMAP设置:', err));
  }, []);

  // 处理标签页变化
  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
  };

  // 显示/隐藏密码
  const togglePasswordVisibility = (field) => {
    setShowPasswords(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  // 保存LLM设置
  const saveLlmSettings = () => {
    fetch('http://localhost:8001/config/llm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(llmSettings)
    })
      .then(res => res.json())
      .then(data => {
        alert('LLM设置已保存');
      })
      .catch(err => {
        console.error('保存LLM设置失败:', err);
        alert('保存LLM设置失败');
      });
  };

  // 保存Exchange设置
  const saveExchangeSettings = () => {
    fetch('http://localhost:8001/config/exchange', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(exchangeSettings)
    })
      .then(res => res.json())
      .then(data => {
        alert('Exchange设置已保存');
      })
      .catch(err => {
        console.error('保存Exchange设置失败:', err);
        alert('保存Exchange设置失败');
      });
  };

  // 保存IMAP设置
  const saveImapSettings = () => {
    fetch('http://localhost:8001/config/imap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(imapSettings)
    })
      .then(res => res.json())
      .then(data => {
        alert('IMAP设置已保存');
      })
      .catch(err => {
        console.error('保存IMAP设置失败:', err);
        alert('保存IMAP设置失败');
      });
  };

  // 同步Exchange日历
  const syncExchangeCalendar = () => {
    // --- 根据邮箱地址选择后端路由 --- 
    let syncUrl = 'http://localhost:8001/sync/exchange'; // 默认路由
    if (exchangeSettings.email && exchangeSettings.email.toLowerCase().includes('@qq.com')) {
        console.log("检测到QQ邮箱，使用Python EWS同步路由");
        syncUrl = 'http://localhost:8001/sync/qq-ews-python'; // QQ邮箱使用新路由
    } else {
        console.log("非QQ邮箱，使用标准Exchange同步路由");
    }
    // -------------------------------

    fetch(syncUrl, { // <-- 使用动态的 syncUrl
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({}) // 不需要发送body，后端会从配置读取
    })
      .then(async res => { // 使用 async 来处理可能的非 JSON 错误响应
          const isJson = res.headers.get('content-type')?.includes('application/json');
          const data = isJson ? await res.json() : await res.text(); // 根据类型解析
          if (!res.ok) {
              // 如果响应状态码不是 2xx，则抛出错误
              const error = (data && (data.error || data.message || data)) || res.statusText;
              throw new Error(error);
          }
          // 成功响应处理
          alert(`Exchange同步完成: ${typeof data === 'string' ? data : data.message}`);
      })
      .catch(err => {
        console.error('Exchange同步失败:', err);
        alert(`Exchange同步失败: ${err.message || err}`);
      });
  };

  // 同步IMAP日历
  const syncImapCalendar = () => {
    fetch('http://localhost:8001/sync/imap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })
      .then(res => res.json())
      .then(data => {
        alert(`IMAP同步完成: ${data.message}`);
      })
      .catch(err => {
        console.error('IMAP同步失败:', err);
        alert('IMAP同步失败');
      });
  };

  // 模态框样式
  const modalStyle = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: 600,
    width: '90%',
    maxHeight: '90vh',
    overflow: 'auto',
    bgcolor: 'background.paper',
    boxShadow: 24,
    borderRadius: 2,
    p: 0,
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      aria-labelledby="settings-modal-title"
      BackdropProps={{
        style: { backgroundColor: 'rgba(0, 0, 0, 0.5)' }
      }}
    >
      <Box sx={modalStyle}>
        <Paper sx={{ p: 3, position: 'relative' }}>
          <IconButton 
            sx={{ position: 'absolute', right: 8, top: 8 }}
            onClick={onClose}
            aria-label="关闭"
          >
            <CloseIcon />
          </IconButton>
          
          <Typography variant="h5" gutterBottom align="center" id="settings-modal-title">设置</Typography>
          
          <Tabs 
            value={currentTab} 
            onChange={handleTabChange} 
            variant="fullWidth" 
            sx={{ mb: 3 }}
          >
            <Tab label="LLM 设置" />
            <Tab label="Exchange" />
            <Tab label="IMAP 邮箱" />
          </Tabs>

          {/* LLM设置面板 */}
          {currentTab === 0 && (
            <Box>
              <Typography variant="h6" gutterBottom>大语言模型配置</Typography>
              <Divider sx={{ mb: 2 }} />
              
              <FormControl fullWidth margin="normal">
                <InputLabel>提供商</InputLabel>
                <Select
                  value={llmSettings.provider}
                  label="提供商"
                  onChange={(e) => setLlmSettings({...llmSettings, provider: e.target.value})}
                >
                  <MenuItem value="none">无</MenuItem>
                  <MenuItem value="openai">OpenAI</MenuItem>
                  <MenuItem value="deepseek">DeepSeek</MenuItem>
                  <MenuItem value="custom">自定义</MenuItem>
                </Select>
              </FormControl>
              
              <TextField
                label="API密钥"
                fullWidth
                margin="normal"
                type={showPasswords.llm ? "text" : "password"}
                value={llmSettings.apiKey || ''}
                onChange={(e) => setLlmSettings({...llmSettings, apiKey: e.target.value})}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => togglePasswordVisibility('llm')}>
                        {showPasswords.llm ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
              
              <TextField
                label="模型名称"
                fullWidth
                margin="normal"
                value={llmSettings.model || ''}
                onChange={(e) => setLlmSettings({...llmSettings, model: e.target.value})}
              />
              
              <TextField
                label="API基础URL (可选)"
                fullWidth
                margin="normal"
                value={llmSettings.baseUrl || ''}
                onChange={(e) => setLlmSettings({...llmSettings, baseUrl: e.target.value})}
              />
              
              <Button 
                variant="contained" 
                color="primary" 
                startIcon={<SaveIcon />}
                onClick={saveLlmSettings}
                sx={{ mt: 2 }}
                fullWidth
              >
                保存LLM设置
              </Button>
            </Box>
          )}

          {/* Exchange设置面板 */}
          {currentTab === 1 && (
            <Box>
              <Typography variant="h6" gutterBottom>Exchange 服务配置</Typography>
              <Divider sx={{ mb: 2 }} />
              
              <TextField
                label="邮箱地址"
                fullWidth
                margin="normal"
                value={exchangeSettings.email || ''}
                onChange={(e) => setExchangeSettings({...exchangeSettings, email: e.target.value})}
              />
              
              <TextField
                label="密码"
                fullWidth
                margin="normal"
                type={showPasswords.exchange ? "text" : "password"}
                value={exchangeSettings.password || ''}
                onChange={(e) => setExchangeSettings({...exchangeSettings, password: e.target.value})}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => togglePasswordVisibility('exchange')}>
                        {showPasswords.exchange ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
              
              <TextField
                label="服务器URL (可选)"
                fullWidth
                margin="normal"
                value={exchangeSettings.serverUrl || ''}
                onChange={(e) => setExchangeSettings({...exchangeSettings, serverUrl: e.target.value})}
              />
              
              <FormControlLabel
                control={
                  <Switch 
                    checked={!!exchangeSettings.active} 
                    onChange={(e) => setExchangeSettings({...exchangeSettings, active: e.target.checked})}
                  />
                }
                label="启用Exchange同步"
              />
              
              <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                <Button 
                  variant="contained" 
                  color="primary" 
                  startIcon={<SaveIcon />}
                  onClick={saveExchangeSettings}
                  sx={{ flex: 1 }}
                >
                  保存设置
                </Button>
                <Button 
                  variant="outlined" 
                  color="secondary" 
                  startIcon={<SyncIcon />}
                  onClick={syncExchangeCalendar}
                  sx={{ flex: 1 }}
                >
                  立即同步
                </Button>
              </Box>
            </Box>
          )}

          {/* IMAP邮箱设置面板 */}
          {currentTab === 2 && (
            <Box>
              <Typography variant="h6" gutterBottom>IMAP 邮箱配置 (QQ邮箱等)</Typography>
              <Divider sx={{ mb: 2 }} />
              
              <TextField
                label="邮箱地址"
                fullWidth
                margin="normal"
                value={imapSettings.email || ''}
                onChange={(e) => setImapSettings({...imapSettings, email: e.target.value})}
              />
              
              <TextField
                label="授权码"
                fullWidth
                margin="normal"
                type={showPasswords.imap ? "text" : "password"}
                value={imapSettings.password || ''}
                onChange={(e) => setImapSettings({...imapSettings, password: e.target.value})}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => togglePasswordVisibility('imap')}>
                        {showPasswords.imap ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
                helperText="QQ邮箱需要在邮箱设置中生成授权码"
              />
              
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="IMAP服务器"
                  margin="normal"
                  value={imapSettings.imapHost || ''}
                  onChange={(e) => setImapSettings({...imapSettings, imapHost: e.target.value})}
                  sx={{ flex: 2 }}
                  helperText="QQ邮箱: imap.qq.com"
                />
                <TextField
                  label="端口"
                  margin="normal"
                  type="number"
                  value={imapSettings.imapPort || 993}
                  onChange={(e) => setImapSettings({...imapSettings, imapPort: parseInt(e.target.value)})}
                  sx={{ flex: 1 }}
                  helperText="通常为993"
                />
              </Box>
              
              <Box sx={{ mt: 1, mb: 2 }}>
                <FormControlLabel
                  control={<Switch checked={!!imapSettings.useTLS} onChange={(e) => 
                    setImapSettings({...imapSettings, useTLS: e.target.checked})} />}
                  label="使用TLS加密"
                />
                <FormControlLabel
                  control={<Switch checked={!!imapSettings.active} onChange={(e) => 
                    setImapSettings({...imapSettings, active: e.target.checked})} />}
                  label="启用IMAP同步"
                />
              </Box>
              
              <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                <Button 
                  variant="contained" 
                  color="primary" 
                  startIcon={<SaveIcon />}
                  onClick={saveImapSettings}
                  sx={{ flex: 1 }}
                >
                  保存设置
                </Button>
                <Button 
                  variant="outlined" 
                  color="secondary" 
                  startIcon={<SyncIcon />}
                  onClick={syncImapCalendar}
                  sx={{ flex: 1 }}
                >
                  立即同步
                </Button>
              </Box>
              
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                <strong>注意:</strong> 使用IMAP同步需要获取QQ邮箱的授权码，不是登录密码。
                可在QQ邮箱设置-账户-POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV服务中开启服务并获取授权码。
              </Typography>
            </Box>
          )}
        </Paper>
      </Box>
    </Modal>
  );
} 