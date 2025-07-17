import React, { useState, useCallback, useEffect } from 'react';
import hybridSettingsService from '../services/hybridSettingsService';
import { getApiBaseUrl, authenticatedFetch } from '../config';

const SettingsPanel = ({ open, onClose, refreshEvents }) => {
  const [activeTab, setActiveTab] = useState('llm');
  const [saveStatus, setSaveStatus] = useState('idle'); // idle, saving, saved, error

  // LLM Settings State
  const [llmSettings, setLlmSettings] = useState({ 
    provider: 'none', 
    api_key: '', 
    base_url: '', 
    model_name: '',
    temperature: 0.7,
    maxTokens: 2000,
    useCustomModel: false
  });
  const [activeLlmTab, setActiveLlmTab] = useState('none');
  const [llmMessage, setLlmMessage] = useState('');
  const [llmError, setLlmError] = useState('');

  // Exchange Settings State
  const [exchangeSettings, setExchangeSettings] = useState({ 
    email: '', 
    password: '', 
    ewsUrl: '', 
    exchangeVersion: 'Exchange2013' 
  });
  const [exchangeMessage, setExchangeMessage] = useState('');
  const [exchangeError, setExchangeError] = useState('');
  const [isSyncingExchange, setIsSyncingExchange] = useState(false);

  // IMAP Settings State
  const [imapSettings, setImapSettings] = useState({ 
    email: '', 
    password: '', 
    imapHost: '', 
    imapPort: 993, 
    useTLS: true 
  });
  const [imapMessage, setImapMessage] = useState('');
  const [imapError, setImapError] = useState('');
  const [isSyncingIMAP, setIsSyncingIMAP] = useState(false);

  // IMAP Filter Settings State
  const [imapAllowlist, setImapAllowlist] = useState([]);
  const [newAllowEmail, setNewAllowEmail] = useState('');
  const [imapFilterMessage, setImapFilterMessage] = useState('');
  const [imapFilterError, setImapFilterError] = useState('');

  // CalDAV Settings State
  const [caldavSettings, setCaldavSettings] = useState({ 
    username: '', 
    password: '', 
    serverUrl: '' 
  });
  const [caldavMessage, setCaldavMessage] = useState('');
  const [caldavError, setCaldavError] = useState('');
  const [isSyncingCalDAV, setIsSyncingCalDAV] = useState(false);  // 加载设置数据
  useEffect(() => {
    if (open) {
      loadAllSettings();
    }
  }, [open]);

  const loadAllSettings = async () => {
    // 本地设置服务不需要认证检查
    console.log('[设置面板] 使用本地设置服务，跳过认证检查');

    // 并行加载所有设置，跳过重复的认证检查
    await Promise.all([
      loadLLMSettingsSkipAuth(),
      loadExchangeSettingsSkipAuth(),
      loadImapSettingsSkipAuth(),
      loadCalDAVSettingsSkipAuth(),
      loadImapFilterSettings()
    ]);
  };

  // --- LLM Settings Handlers ---
  const loadLLMSettingsSkipAuth = useCallback(async () => {
    try {
      const localSettings = await hybridSettingsService.getLLMSettings(true);
      if (localSettings) {
        const provider = localSettings.provider || 'none';
        
        // 处理API密钥显示：如果有密钥且不是特殊标记，则显示占位符
        let displayApiKey = '';
        if (localSettings.api_key) {
          if (localSettings.api_key === 'BUILTIN_PROXY') {
            displayApiKey = 'BUILTIN_PROXY';
          } else {
            displayApiKey = '********';
          }
        }
        
        setLlmSettings(prev => ({
          ...prev,
          provider: provider,
          base_url: localSettings.base_url || '',
          model_name: localSettings.model_name || '',
          api_key: displayApiKey,
          temperature: localSettings.temperature || 0.7,
          maxTokens: localSettings.maxTokens || 2000,
          useCustomModel: localSettings.useCustomModel || false
        }));

        // 定位到正确的选项卡
        if (provider === 'builtin' || provider === 'builtin-free') {
          setActiveLlmTab('builtin'); 
        } else if (provider !== 'none') {
          setActiveLlmTab('custom');
        } else {
          setActiveLlmTab('none');
        }
      }
    } catch (error) {
      console.error('[智能日历] 加载LLM设置失败:', error);
      setLlmError('无法连接到本地设置服务，请检查服务状态。');
    }
  }, []);

  // 获取指定provider的默认模型
  const getDefaultModelForProvider = (provider) => {
    const defaultModels = {
      'openai': 'gpt-4o-mini',
      'deepseek': 'deepseek-chat',
      'anthropic': 'claude-3-haiku-20240307',
      'openrouter': 'deepseek/deepseek-chat-v3-0324:free',
      'builtin-free': 'deepseek/deepseek-chat-v3-0324:free',
      'other': ''
    };
    return defaultModels[provider] || '';
  };

  // 获取指定provider的模型选项列表
  const getModelOptionsForProvider = (provider) => {
    const modelOptions = {
      'openai': [
        { value: 'gpt-4o', label: 'GPT-4o' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini (推荐)' },
        { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
        { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
      ],
      'deepseek': [
        { value: 'deepseek-chat', label: 'DeepSeek Chat (推荐)' },
        { value: 'deepseek-coder', label: 'DeepSeek Coder' }
      ],
      'anthropic': [
        { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
        { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku (推荐)' },
        { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' }
      ],
      'openrouter': [
        { value: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek Chat V3 (Free)' },
        { value: 'meta-llama/llama-3.2-3b-instruct:free', label: 'Llama 3.2 3B (Free)' },
        { value: 'microsoft/phi-3-mini-128k-instruct:free', label: 'Phi-3 Mini (Free)' },
        { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
        { value: 'anthropic/claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' }
      ],
      'other': [
        { value: '', label: '请输入自定义模型名称' }
      ]
    };
    
    return modelOptions[provider] || [{ value: '', label: '请选择模型' }];
  };

  const handleSaveLLMSettings = async () => {
    setLlmMessage('');
    setLlmError('');
    setSaveStatus('saving');
    
    try {
      const settingsToSave = { ...llmSettings };
      
      // 处理API密钥：如果显示的是占位符，保持原有密钥
      if (settingsToSave.api_key === '********' || settingsToSave.api_key === '' || settingsToSave.api_key === 'BUILTIN_PROXY') {
        // 获取当前保存的设置，保留原有的API密钥
        try {
          const currentSettings = await hybridSettingsService.getLLMSettings(true);
          if (currentSettings && currentSettings.api_key) {
            // 如果当前显示的是占位符或空值，且后端有实际的密钥，则保留后端的密钥
            if ((settingsToSave.api_key === '********' || settingsToSave.api_key === '') && 
                currentSettings.api_key !== 'BUILTIN_PROXY') {
              settingsToSave.api_key = currentSettings.api_key;
            } else if (settingsToSave.api_key === 'BUILTIN_PROXY') {
              settingsToSave.api_key = 'BUILTIN_PROXY';
            }
          }
        } catch (error) {
          console.warn('获取当前设置失败，继续保存:', error);
        }
      }
      
      // 移除前端显示用的字段
      delete settingsToSave._hasApiKey;
      
      const success = await hybridSettingsService.saveLLMSettings(settingsToSave);
      if (success) {
        setLlmMessage('LLM设置已保存，与灵枢笔记保持同步。');
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setLlmError('保存LLM设置失败，请检查本地设置服务状态。');
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (error) {
      setLlmError('保存LLM设置时出错: ' + error.message);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };  // --- Exchange Settings Handlers ---
  const loadExchangeSettingsSkipAuth = useCallback(async () => {
    try {
      const localSettings = await hybridSettingsService.getExchangeSettings(true);
      if (localSettings) {
        setExchangeSettings(prev => ({
          ...prev,
          email: localSettings.email || '',
          password: localSettings.password || '', // 直接使用后端返回的密码字段（可能是占位符）
          ewsUrl: localSettings.ewsUrl || '',
          exchangeVersion: localSettings.exchangeVersion || 'Exchange2013'
        }));
      }
    } catch (error) {
      console.error('[智能日历] 加载Exchange设置失败:', error);
      setExchangeError('无法连接到本地设置服务。');
    }
  }, []);

  const handleSaveExchangeSettings = async () => {
    setExchangeMessage('');
    setExchangeError('');
    
    try {
      const success = await hybridSettingsService.saveExchangeSettings(exchangeSettings);
      if (success) {
        setExchangeMessage('Exchange设置已保存到本地设置服务。');
      } else {
        setExchangeError('保存Exchange设置失败。');
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
      syncUrl = `${getApiBaseUrl()}/sync/qq-eas`; // Prefer QQ EAS Node.js version
      accountType = 'QQ EAS';
    } else {
      syncUrl = `${getApiBaseUrl()}/sync/outlook-ews`; // Standard EWS Node.js version
      accountType = 'Outlook/Exchange EWS';
    }

    try {
      const response = await authenticatedFetch(syncUrl, { method: 'POST' });
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
  };  // --- IMAP Settings Handlers ---
  const loadImapSettingsSkipAuth = useCallback(async () => {
    try {
      const localSettings = await hybridSettingsService.getIMAPSettings(true);
      if (localSettings) {
        setImapSettings(prev => ({
          ...prev,
          email: localSettings.email || '',
          password: localSettings.password || '', // 直接使用后端返回的密码字段（可能是占位符）
          imapHost: localSettings.imapHost || '',
          imapPort: localSettings.imapPort || 993,
          useTLS: localSettings.useTLS !== undefined ? localSettings.useTLS : true
        }));
      }
    } catch (error) {
      console.error('[智能日历] 加载IMAP设置失败:', error);
      setImapError('无法连接到本地设置服务。');
    }
  }, []);

  const handleSaveImapSettings = async () => {
    setImapMessage('');
    setImapError('');
    
    try {
      const success = await hybridSettingsService.saveIMAPSettings(imapSettings);
      if (success) {
        setImapMessage('IMAP设置已保存到本地设置服务。');
      } else {
        setImapError('保存IMAP设置失败。');
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

      const response = await authenticatedFetch(`${getApiBaseUrl()}/sync/imap`, {
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
  };  // IMAP Filter Settings Handlers
  const loadImapFilterSettings = useCallback(async () => {
    try {
      const response = await authenticatedFetch(`${getApiBaseUrl()}/config/imap-filter`);
      if (response.ok) {
        const data = await response.json();
        setImapAllowlist(data.sender_allowlist || []);
      }
    } catch (error) {
      console.error('加载IMAP白名单设置失败:', error);
    }
  }, []);

  const handleSaveImapFilterSettings = async () => {
    setImapFilterMessage('');
    setImapFilterError('');
    try {
      const response = await authenticatedFetch(`${getApiBaseUrl()}/config/imap-filter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender_allowlist: imapAllowlist })
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

  const addAllowlistEmail = () => {
    if (newAllowEmail && !imapAllowlist.includes(newAllowEmail)) {
      setImapAllowlist([...imapAllowlist, newAllowEmail]);
      setNewAllowEmail('');
    }
  };

  const removeAllowlistEmail = (email) => {
    setImapAllowlist(imapAllowlist.filter(e => e !== email));
  };  // --- CalDAV Settings Handlers ---
  const loadCalDAVSettingsSkipAuth = useCallback(async () => {
    try {
      const localSettings = await hybridSettingsService.getCalDAVSettings(true);
      if (localSettings) {
        setCaldavSettings(prev => ({
          ...prev,
          username: localSettings.username || '',
                    password: localSettings.password || '', // 直接使用后端返回的密码字段（可能是占位符）
          serverUrl: localSettings.serverUrl || ''
        }));
      }
    } catch (error) {
      console.error('[智能日历] 加载CalDAV设置失败:', error);
      setCaldavError('无法连接到本地设置服务。');
    }
  }, []);

  const handleSaveCalDAVSettings = async () => {
    setCaldavMessage('');
    setCaldavError('');
    
    try {
      const success = await hybridSettingsService.saveCalDAVSettings(caldavSettings);
      if (success) {
        setCaldavMessage('CalDAV设置已保存到本地设置服务。');
      } else {
        setCaldavError('保存CalDAV设置失败。');
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
      const response = await authenticatedFetch(`${getApiBaseUrl()}/sync/caldav`, {
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

  if (!open) return null;  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">设置</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex">
            {[
              { id: 'llm', label: 'LLM设置' },
              { id: 'exchange', label: 'Exchange' },
              { id: 'imap', label: 'IMAP' },
              { id: 'caldav', label: 'CalDAV' }
            ].map((tab) => (
              <button
                key={tab.id}
                className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 border-transparent'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto p-6">          {/* LLM Settings */}
          {activeTab === 'llm' && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900">大语言模型 (LLM) 设置</h3>
              
              {/* Provider Selection */}
              <div className="form-group">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  选择供应商
                </label>
                <select
                  value={llmSettings.provider}
                  onChange={async (e) => {
                    const newProvider = e.target.value;
                    
                    // 从后端加载该provider的配置
                    try {
                      const response = await fetch(`${getApiBaseUrl()}/config/llm/${newProvider}`);
                      if (response.ok) {
                        const providerSettings = await response.json();
                        setLlmSettings(prev => ({
                          ...prev,
                          provider: newProvider,
                          model_name: providerSettings.model_name || getDefaultModelForProvider(newProvider),
                          useCustomModel: providerSettings.useCustomModel || false,
                          api_key: providerSettings.api_key || (newProvider === 'builtin-free' ? 'BUILTIN_PROXY' : ''),
                          base_url: providerSettings.base_url || '',
                          temperature: providerSettings.temperature || 0.7,
                          maxTokens: providerSettings.max_tokens || 2000
                        }));
                      } else {
                        // 如果后端没有该provider的配置，使用默认配置
                        setLlmSettings(prev => ({
                          ...prev,
                          provider: newProvider,
                          model_name: getDefaultModelForProvider(newProvider),
                          useCustomModel: false,
                          api_key: newProvider === 'builtin-free' ? 'BUILTIN_PROXY' : '',
                          base_url: '',
                          temperature: 0.7,
                          maxTokens: 2000
                        }));
                      }
                    } catch (error) {
                      console.warn('加载provider配置失败，使用默认配置:', error);
                      setLlmSettings(prev => ({
                        ...prev,
                        provider: newProvider,
                        model_name: getDefaultModelForProvider(newProvider),
                        useCustomModel: false,
                        api_key: newProvider === 'builtin-free' ? 'BUILTIN_PROXY' : '',
                        base_url: '',
                        temperature: 0.7,
                        maxTokens: 2000
                      }));
                    }
                    
                    // 根据选择切换相应的子选项卡
                    if (newProvider === 'builtin' || newProvider === 'builtin-free') {
                      setActiveLlmTab('builtin');
                    } else if (newProvider !== 'none') {
                      setActiveLlmTab('custom');
                    } else {
                      setActiveLlmTab('none');
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="none">不使用</option>
                  <option value="builtin-free">内置免费模型</option>
                  <option value="openai">OpenAI</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="other">其他</option>
                </select>
              </div>

              {/* Configuration Forms */}
              {llmSettings.provider !== 'none' && (
                <>
                  {/* Custom Provider Settings */}
                  {llmSettings.provider !== 'builtin-free' && (                    <div className="space-y-4">
                      <div className="form-group">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          API Key
                        </label>
                        <input
                          type="password"
                          value={llmSettings.api_key}
                          onChange={(e) => setLlmSettings(prev => ({ ...prev, api_key: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="请输入API密钥"
                        />
                      </div>
                      
                      <div className="form-group">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Base URL
                        </label>
                        <input
                          type="url"
                          value={llmSettings.base_url}
                          onChange={(e) => setLlmSettings(prev => ({ ...prev, base_url: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="API基础URL"
                        />
                      </div>
                      
                      <div className="form-group">
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-sm font-medium text-gray-700">
                            模型名称
                          </label>
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id="useCustomModel"
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              checked={llmSettings.useCustomModel || false}
                              onChange={(e) => {
                                const useCustom = e.target.checked;
                                setLlmSettings(prev => ({
                                  ...prev,
                                  useCustomModel: useCustom,
                                  model_name: !useCustom ? getDefaultModelForProvider(prev.provider) : prev.model_name
                                }));
                              }}
                            />
                            <label htmlFor="useCustomModel" className="ml-2 text-xs text-gray-600 cursor-pointer">
                              使用自定义模型
                            </label>
                          </div>
                        </div>
                        
                        {llmSettings.useCustomModel ? (
                          <input
                            type="text"
                            value={llmSettings.model_name}
                            onChange={(e) => setLlmSettings(prev => ({ ...prev, model_name: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="输入自定义模型名称"
                          />
                        ) : (
                          <select
                            value={llmSettings.model_name}
                            onChange={(e) => setLlmSettings(prev => ({ ...prev, model_name: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
                          >
                            {getModelOptionsForProvider(llmSettings.provider).map(option => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        )}
                        
                        <p className="text-xs text-gray-500 mt-1">
                          {llmSettings.useCustomModel 
                            ? '您正在使用自定义模型名称' 
                            : '使用预定义模型列表'}
                        </p>
                      </div>
                    </div>
                  )}                  {/* Common Settings */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="form-group">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        温度 ({llmSettings.temperature})
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={llmSettings.temperature}
                        onChange={(e) => setLlmSettings(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    
                    <div className="form-group">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        最大Token数
                      </label>
                      <input
                        type="number"
                        value={llmSettings.maxTokens}
                        onChange={(e) => setLlmSettings(prev => ({ ...prev, maxTokens: parseInt(e.target.value) || 2000 }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        min="100"
                        max="8000"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleSaveLLMSettings}
                    disabled={saveStatus === 'saving'}
                    className={`w-full py-2 px-4 rounded-md text-sm font-medium text-white shadow-sm transition-colors ${
                      saveStatus === 'saving'
                        ? 'bg-gray-400 cursor-not-allowed'
                        : saveStatus === 'saved'
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {saveStatus === 'saving' ? '保存中...' : saveStatus === 'saved' ? '已保存' : '保存LLM设置'}
                  </button>
                </>
              )}

              {/* Messages */}
              {llmMessage && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                  <span className="text-sm text-green-800">{llmMessage}</span>
                </div>
              )}
              {llmError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <span className="text-sm text-red-800">{llmError}</span>
                </div>
              )}
            </div>
          )}          {/* Exchange Settings */}
          {activeTab === 'exchange' && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900">Exchange / Outlook 设置</h3>
              
              <div className="form-group">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  邮箱地址
                </label>
                <input
                  type="email"
                  value={exchangeSettings.email}
                  onChange={(e) => setExchangeSettings(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="请输入邮箱地址"
                />
              </div>
              
              <div className="form-group">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  密码或授权码
                </label>
                <input
                  type="password"
                  value={exchangeSettings.password}
                  onChange={(e) => setExchangeSettings(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="请输入密码或授权码"
                />
              </div>
              
              <div className="form-group">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  EWS URL (可选)
                </label>
                <input
                  type="url"
                  value={exchangeSettings.ewsUrl}
                  onChange={(e) => setExchangeSettings(prev => ({ ...prev, ewsUrl: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="例如 https://outlook.office365.com/EWS/Exchange.asmx"
                />
              </div>
              
              <div className="flex gap-4">
                <button
                  onClick={handleSaveExchangeSettings}
                  className="flex-1 py-2 px-4 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors"
                >
                  保存Exchange设置
                </button>
                <button
                  onClick={handleSyncExchange}
                  disabled={isSyncingExchange || !exchangeSettings.email || !exchangeSettings.password}
                  className="flex-1 py-2 px-4 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 shadow-sm transition-colors"
                >
                  {isSyncingExchange ? '同步中...' : '立即同步'}
                </button>
              </div>

              {/* Messages */}
              {exchangeMessage && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                  <span className="text-sm text-green-800">{exchangeMessage}</span>
                </div>
              )}
              {exchangeError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <span className="text-sm text-red-800">{exchangeError}</span>
                </div>
              )}
            </div>
          )}          {/* IMAP Settings */}
          {activeTab === 'imap' && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900">IMAP 设置</h3>
              
              <div className="form-group">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  邮箱地址
                </label>
                <input
                  type="email"
                  value={imapSettings.email}
                  onChange={(e) => setImapSettings(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="请输入邮箱地址"
                />
              </div>
              
              <div className="form-group">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  密码或授权码
                </label>
                <input
                  type="password"
                  value={imapSettings.password}
                  onChange={(e) => setImapSettings(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="请输入密码或授权码"
                />
              </div>
              
              <div className="form-group">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  IMAP 服务器地址
                </label>
                <input
                  type="text"
                  value={imapSettings.imapHost}
                  onChange={(e) => setImapSettings(prev => ({ ...prev, imapHost: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="例如 imap.qq.com 或 imap.gmail.com"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    IMAP 端口
                  </label>
                  <input
                    type="number"
                    value={imapSettings.imapPort}
                    onChange={(e) => setImapSettings(prev => ({ ...prev, imapPort: parseInt(e.target.value) || 993 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="993"
                  />
                </div>
                
                <div className="form-group">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    使用 TLS
                  </label>
                  <select
                    value={imapSettings.useTLS}
                    onChange={(e) => setImapSettings(prev => ({ ...prev, useTLS: e.target.value === 'true' }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="true">是</option>
                    <option value="false">否</option>
                  </select>
                </div>
              </div>
              
              <div className="flex gap-4">
                <button
                  onClick={handleSaveImapSettings}
                  className="flex-1 py-2 px-4 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors"
                >
                  保存IMAP设置
                </button>
                <button
                  onClick={handleSyncImap}
                  disabled={isSyncingIMAP || !imapSettings.email || !imapSettings.password || !imapSettings.imapHost}
                  className="flex-1 py-2 px-4 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 shadow-sm transition-colors"
                >
                  {isSyncingIMAP ? '同步中...' : '立即同步'}
                </button>
              </div>

              {/* Messages */}
              {imapMessage && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                  <span className="text-sm text-green-800">{imapMessage}</span>
                </div>
              )}
              {imapError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <span className="text-sm text-red-800">{imapError}</span>
                </div>
              )}

              {/* IMAP Filter Section */}
              <div className="border-t border-gray-200 pt-6 mt-6">
                <h4 className="text-lg font-medium text-gray-900 mb-4">IMAP 邮件解析白名单</h4>
                <p className="text-sm text-gray-600 mb-4">
                  只有以下列表中的发件人邮件才会被尝试使用 LLM 解析内容以创建日程。
                </p>
                
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={newAllowEmail}
                      onChange={(e) => setNewAllowEmail(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="添加发件人邮箱"
                    />
                    <button
                      onClick={addAllowlistEmail}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      添加
                    </button>
                  </div>
                  
                  <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-md p-3">
                    {imapAllowlist.length === 0 ? (
                      <p className="text-gray-500 text-sm">暂无白名单邮箱</p>
                    ) : (
                      <div className="space-y-2">
                        {imapAllowlist.map((email, index) => (
                          <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded">
                            <span className="text-sm font-mono">{email}</span>
                            <button
                              onClick={() => removeAllowlistEmail(email)}
                              className="text-red-600 hover:text-red-800 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <button
                    onClick={handleSaveImapFilterSettings}
                    className="w-full py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                  >
                    保存白名单
                  </button>
                  
                  {/* Filter Messages */}
                  {imapFilterMessage && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                      <span className="text-sm text-green-800">{imapFilterMessage}</span>
                    </div>
                  )}
                  {imapFilterError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                      <span className="text-sm text-red-800">{imapFilterError}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}          {/* CalDAV Settings */}
          {activeTab === 'caldav' && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900">CalDAV 设置</h3>
              
              <div className="form-group">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  服务器地址
                </label>
                <input
                  type="url"
                  value={caldavSettings.serverUrl}
                  onChange={(e) => setCaldavSettings(prev => ({ ...prev, serverUrl: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="例如 dav.qq.com 或 caldav.feishu.cn"
                />
              </div>
              
              <div className="form-group">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  用户名
                </label>
                <input
                  type="text"
                  value={caldavSettings.username}
                  onChange={(e) => setCaldavSettings(prev => ({ ...prev, username: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="通常是完整的邮箱地址"
                />
              </div>
              
              <div className="form-group">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  密码或应用专用密码
                </label>
                <input
                  type="password"
                  value={caldavSettings.password}
                  onChange={(e) => setCaldavSettings(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="请输入密码"
                />
              </div>
              
              <div className="flex gap-4">
                <button
                  onClick={handleSaveCalDAVSettings}
                  className="flex-1 py-2 px-4 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors"
                >
                  保存CalDAV设置
                </button>
                <button
                  onClick={handleSyncCalDAV}
                  disabled={isSyncingCalDAV || !caldavSettings.username || !caldavSettings.password || !caldavSettings.serverUrl}
                  className="flex-1 py-2 px-4 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 shadow-sm transition-colors"
                >
                  {isSyncingCalDAV ? '同步中...' : '立即同步'}
                </button>
              </div>

              {/* Messages */}
              {caldavMessage && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                  <span className="text-sm text-green-800">{caldavMessage}</span>
                </div>
              )}
              {caldavError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <span className="text-sm text-red-800">{caldavError}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;