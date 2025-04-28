import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Form, Input, Button, message, Card, Typography, Space, Select } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { Script, AICharacter } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { useLastVisited } from '../contexts/LastVisitedContext'; // <-- 导入 Context Hook

// 定义页面内部状态快照的类型
type ScriptEditorStateSnapshot = {
    formValues: Partial<Script>;
    isEditMode: boolean;
    scriptId?: string;
};

const ScriptEditorPage: React.FC = () => {
  const { id: scriptIdFromParams } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation(); // <-- 获取 location
  const { updateLastVisitedNavInfo } = useLastVisited(); // <-- 使用 Context Hook
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false); // 用于保存时的 loading
  const [dataLoading, setDataLoading] = useState(false); // 用于加载剧本/角色数据的 loading
  const [allCharacters, setAllCharacters] = useState<AICharacter[]>([]);

  const restoredState = location.state as ScriptEditorStateSnapshot | undefined;
  const isEditMode = restoredState?.isEditMode ?? !!scriptIdFromParams;
  const scriptId = restoredState?.scriptId ?? scriptIdFromParams;

  const scriptsFileName = 'scripts.json';
  const rolesFileName = 'characters.json';

  const [currentFormValues, setCurrentFormValues] = useState<Partial<Script>>(restoredState?.formValues ?? {});
  const isInitialLoad = useRef(true);

  // --- 数据加载或状态恢复 Effect ---
  useEffect(() => {
    const loadAllData = async () => {
        setDataLoading(true); // 开始加载数据
        try {
            // 1. 加载角色列表 (总是需要)
            const charactersResult = await window.electronAPI.readStore(rolesFileName, [] as AICharacter[]);
            if (charactersResult.success && Array.isArray(charactersResult.data)) {
                setAllCharacters(charactersResult.data);
            } else {
                message.error(`加载角色列表失败: ${charactersResult.error || '未知错误'}`);
            }

            // 2. 根据情况加载剧本或恢复状态
            const isActualNavigation = location.key !== 'default'; // 检查是否是实际导航触发的渲染
            if (restoredState && restoredState.formValues && isActualNavigation) {
                console.log('[ScriptEditorPage] Restoring state from context:', restoredState);
                form.setFieldsValue(restoredState.formValues);
                setCurrentFormValues(restoredState.formValues);
            } else if (isEditMode && scriptId && isInitialLoad.current) {
                console.log('[ScriptEditorPage] Loading script data for editing...');
                const scriptsResult = await window.electronAPI.readStore(scriptsFileName, [] as Script[]);
                if (scriptsResult.success && Array.isArray(scriptsResult.data)) {
                    const scriptToEdit = scriptsResult.data.find(script => script.id === scriptId);
                    if (scriptToEdit) {
                        form.setFieldsValue(scriptToEdit);
                        setCurrentFormValues(scriptToEdit);
                    } else {
                        message.error('未找到要编辑的剧本！');
                        navigate('/scripts');
                    }
                } else {
                    message.error(`加载剧本数据失败: ${scriptsResult.error || '未知错误'}`);
                    navigate('/scripts');
                }
            } else if (!isEditMode && isInitialLoad.current) {
                console.log('[ScriptEditorPage] Initializing for add mode...');
                const defaultValues = { characterIds: [] }; // 添加模式默认值
                form.setFieldsValue(defaultValues);
                setCurrentFormValues(defaultValues);
            }
        } catch (error) {
            message.error(`加载页面数据时出错: ${error instanceof Error ? error.message : String(error)}`);
            if (isEditMode) navigate('/scripts'); // 出错时返回列表
        } finally {
            setDataLoading(false); // 数据加载结束
            isInitialLoad.current = false; // 标记为非首次加载
        }
    };

    loadAllData();

  }, [isEditMode, scriptId, navigate, form, restoredState, location.key]); // 依赖项

  // --- 监听表单值变化并更新 currentFormValues ---
  const handleFormValuesChange = (_changedValues: unknown, allValues: Partial<Script>) => {
      if (!isInitialLoad.current) {
          setCurrentFormValues(allValues);
      }
  };

  // --- 保存状态到 Context Effect ---
  useEffect(() => {
    if (!isInitialLoad.current && !dataLoading && Object.keys(currentFormValues).length > 0) {
        const currentStateSnapshot: ScriptEditorStateSnapshot = {
            formValues: currentFormValues,
            isEditMode: isEditMode,
            scriptId: scriptId,
        };
        updateLastVisitedNavInfo('scripts', location.pathname, undefined, currentStateSnapshot);
    }
  }, [currentFormValues, isEditMode, scriptId, updateLastVisitedNavInfo, location.pathname, dataLoading]);


  // --- 处理表单提交 (保存) ---
  const handleFinish = async (values: Partial<Script>) => {
    // 校验必填项
    if (!values.title) {
        message.error('请输入剧本标题！');
        return;
    }

    setLoading(true); // 保存操作的 loading
    try {
      const allScriptsResult = await window.electronAPI.readStore(scriptsFileName, [] as Script[]);
      if (!allScriptsResult.success || !Array.isArray(allScriptsResult.data)) {
         message.error(`加载现有剧本列表失败: ${allScriptsResult.error || '未知错误'}`);
         setLoading(false);
         return;
      }

      let updatedScripts: Script[];
      const currentScripts = allScriptsResult.data;
      const selectedCharacterIds = values.characterIds || [];

      // 类型断言 (假设校验后满足要求)
      const finalValues = values as Omit<Script, 'id'>;

      if (isEditMode && scriptId) {
        updatedScripts = currentScripts.map(script =>
          script.id === scriptId ? {
             ...script, // 保留旧数据（如 id）
             ...finalValues, // 应用表单所有新值
             characterIds: selectedCharacterIds, // 确保 characterIds 被更新
             id: scriptId // 确保 ID 不变
            } : script
        );
      } else {
        const newScript: Script = {
          id: uuidv4(),
          ...finalValues,
          characterIds: selectedCharacterIds,
        };
        updatedScripts = [...currentScripts, newScript];
      }

      const saveResult = await window.electronAPI.writeStore(scriptsFileName, updatedScripts);
      if (saveResult.success) {
        message.success(isEditMode ? '剧本已更新' : '剧本已添加');
        updateLastVisitedNavInfo('scripts', '/scripts', undefined, undefined); // 清除状态
        navigate('/scripts');
      } else {
        message.error(`保存剧本失败: ${saveResult.error || '未知错误'}`);
      }
    } catch (error) {
      message.error(`保存剧本时出错: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title={
      <Space>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/scripts')} />
        <Typography.Title level={4} style={{ marginBottom: 0 }}>
          {isEditMode ? "编辑剧本" : "添加新剧本"}
        </Typography.Title>
      </Space>
     }
     extra={<Typography.Text type="secondary">填写剧本的详细信息</Typography.Text>}
     loading={dataLoading && isInitialLoad.current} // 只有首次加载数据时显示 loading
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        onValuesChange={handleFormValuesChange} // 监听变化
      >
        <Form.Item name="title" label="剧本标题" rules={[{ required: true, message: '请输入剧本标题!' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="scene" label="场景描述 (可选)">
          <Input.TextArea rows={3} placeholder="描述故事发生的场景..." />
        </Form.Item>
        <Form.Item name="genre" label="类型/题材 (可选)">
          <Input placeholder="例如：喜剧、悲剧、科幻、武侠..." />
        </Form.Item>
        <Form.Item name="setting" label="时代/背景设定 (可选)">
          <Input.TextArea rows={2} placeholder="例如：古代宫廷、未来都市、架空世界..." />
        </Form.Item>
        <Form.Item name="synopsis" label="剧情梗概 (可选)">
          <Input.TextArea rows={4} placeholder="简要描述剧本的主要情节..." />
        </Form.Item>
        <Form.Item name="mood" label="氛围/基调 (可选)">
          <Input placeholder="例如：轻松、紧张、悬疑、温馨..." />
        </Form.Item>
        <Form.Item name="themes" label="主题 (可选)">
          <Input.TextArea rows={2} placeholder="剧本探讨的核心主题，用逗号分隔..." />
        </Form.Item>
        <Form.Item name="tags" label="标签 (可选)">
          <Select
            mode="tags"
            style={{ width: '100%' }}
            placeholder="输入标签后按回车确认，例如：宫斗, 权谋, 反转"
            tokenSeparators={[',']}
          />
        </Form.Item>
        <Form.Item name="characterIds" label="选择角色 (可选)">
          <Select
            mode="multiple"
            allowClear
            style={{ width: '100%' }}
            placeholder="请选择参演角色"
            loading={dataLoading && !allCharacters.length} // 角色列表加载中显示 loading
            options={allCharacters.map(character => ({
              label: character.name,
              value: character.id,
            }))}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            {isEditMode ? '更新剧本' : '添加剧本'}
          </Button>
          <Button style={{ marginLeft: 8 }} onClick={() => navigate('/scripts')}>
            取消
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default ScriptEditorPage;