import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
// 导入 theme 用于获取背景色等 token
import { Form, Input, Button, message, Card, Typography, Space, Select, theme } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { Script, AICharacter } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { useLastVisited } from '../hooks/useLastVisited'; // <-- 修改导入路径
import { scriptLogger as logger } from '../utils/logger'; // 导入日志工具

// 定义页面内部状态快照的类型
type ScriptEditorStateSnapshot = {
    formValues: Partial<Script>;
    isEditMode: boolean;
    scriptId?: string;
};

const ScriptEditorPage: React.FC = () => {
  const { id: scriptIdFromParams } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { updateLastVisitedNavInfo } = useLastVisited(); // <-- 现在可以正确导入了
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false); // 用于保存时的 loading
  const [dataLoading, setDataLoading] = useState(false); // 用于加载剧本/角色数据的 loading
  const [allCharacters, setAllCharacters] = useState<AICharacter[]>([]);
  // 获取 antd 主题 token
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  const restoredState = location.state as ScriptEditorStateSnapshot | undefined;
  const isEditMode = restoredState?.isEditMode ?? !!scriptIdFromParams;
  const scriptId = restoredState?.scriptId ?? scriptIdFromParams;

  // const scriptsFileName = 'scripts.json'; // 不再需要
  // const rolesFileName = 'characters.json'; // 不再需要

  const [currentFormValues, setCurrentFormValues] = useState<Partial<Script>>(restoredState?.formValues ?? {});
  const isInitialLoad = useRef(true);

  // --- 数据加载或状态恢复 Effect ---
  useEffect(() => {
    const loadAllData = async () => {
        setDataLoading(true);
        try {
            // 1. 加载角色列表 (总是需要) - 使用新 API
            logger.info('加载角色...');
            const charactersResult = await window.electronAPI.listCharacters();
            if (charactersResult.success && Array.isArray(charactersResult.data)) {
                logger.info(`已加载角色: ${charactersResult.data.length}个`);
                setAllCharacters(charactersResult.data);
            } else {
                message.error(`加载角色列表失败: ${charactersResult.error || '未知错误'}`);
                setAllCharacters([]); // 出错时清空
            }

            // 2. 根据情况加载剧本或恢复状态
            const isActualNavigation = location.key !== 'default';
            if (restoredState && restoredState.formValues && isActualNavigation) {
                logger.info('从上下文恢复状态:', restoredState);
                form.setFieldsValue(restoredState.formValues);
                setCurrentFormValues(restoredState.formValues);
            } else if (isEditMode && scriptId && isInitialLoad.current) {
                logger.info('加载剧本数据进行编辑...');
                // 使用 listScripts 获取所有剧本，然后在前端查找
                const scriptsResult = await window.electronAPI.listScripts();
                if (scriptsResult.success && Array.isArray(scriptsResult.data)) {
                    const scriptToEdit = scriptsResult.data.find(script => script.id === scriptId);
                    if (scriptToEdit) {
                        logger.info('找到要编辑的剧本:', scriptToEdit);
                        form.setFieldsValue(scriptToEdit);
                        setCurrentFormValues(scriptToEdit);
                    } else {
                        message.error(`ID 为 ${scriptId} 的剧本未找到！`);
                        navigate('/scripts');
                    }
                } else {
                    message.error(`加载剧本列表失败: ${scriptsResult.error || '未知错误'}`);
                    navigate('/scripts');
                }
            } else if (!isEditMode && isInitialLoad.current) {
                logger.info('初始化添加模式...');
                const defaultValues = { characterIds: [], tags: [] }; // 添加模式默认值
                form.setFieldsValue(defaultValues);
                setCurrentFormValues(defaultValues);
            }
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            message.error(`加载页面数据时出错: ${errorMsg}`);
            if (isEditMode) navigate('/scripts');
        } finally {
            setDataLoading(false);
            isInitialLoad.current = false;
        }
    };

    loadAllData();

  }, [isEditMode, scriptId, navigate, form, restoredState, location.key]);

  // --- 监听表单值变化并更新 currentFormValues ---
  const handleFormValuesChange = (_changedValues: unknown, allValues: Partial<Script>) => {
      if (!isInitialLoad.current) {
          // 确保 ID 不会被表单覆盖
          const valuesToStore = { ...allValues };
          if (isEditMode && scriptId && !valuesToStore.id) {
              valuesToStore.id = scriptId;
          }
          setCurrentFormValues(valuesToStore);
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
        logger.info('保存快照到上下文:', currentStateSnapshot);
        updateLastVisitedNavInfo('scripts', location.pathname, undefined, currentStateSnapshot);
    }
  }, [currentFormValues, isEditMode, scriptId, updateLastVisitedNavInfo, location.pathname, dataLoading]);


  // --- 处理表单提交 (保存) ---
  const handleFinish = async (values: Partial<Script>) => {
    if (!values.title) {
        message.error('请输入剧本标题！');
        return;
    }

    setLoading(true);
    try {
      // 准备要保存的剧本数据
      const scriptToSave: Script = {
        ...values, // 包含表单所有字段
        id: isEditMode && scriptId ? scriptId : uuidv4(), // 编辑模式用现有 ID，添加模式生成新 ID
        title: values.title, // 确保必填项存在 (TS 需要)
        // 确保其他可选字段如果为 undefined 或空数组/字符串，也正确传递
        scene: values.scene || undefined,
        characterIds: values.characterIds || [],
        genre: values.genre || undefined,
        setting: values.setting || undefined,
        synopsis: values.synopsis || undefined,
        mood: values.mood || undefined,
        themes: values.themes || undefined,
        tags: values.tags || [],
      };

      logger.info('尝试保存剧本:', scriptToSave);

      // 调用新的 saveScript API
      const saveResult = await window.electronAPI.saveScript(scriptToSave);

      if (saveResult.success) {
        message.success(isEditMode ? '剧本已更新' : '剧本已添加');
        // 清除当前版块的最后访问状态，以便下次从列表页进入
        updateLastVisitedNavInfo('scripts', '/scripts', undefined, undefined);
        navigate('/scripts'); // 保存成功后返回列表页
      } else {
        message.error(`保存剧本失败: ${saveResult.error || '未知错误'}`);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error(`调用 saveScript 时出错: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    // 1. 添加外部 div，负责滚动和左侧 5px 灰色边距
    <div style={{ maxHeight: 'calc(100vh - 5px)', overflow: 'auto', paddingLeft: '5px' }}>
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
    // 设置 Card 样式：白色背景、圆角、无边框
    style={{ background: colorBgContainer, borderRadius: borderRadiusLG }}
    styles={{ body: { padding: 10 } }} // 使用styles.body代替已弃用的bodyStyle
    variant="borderless" // 使用variant代替已弃用的bordered
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        onValuesChange={handleFormValuesChange}
        initialValues={currentFormValues} // 设置初始值
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
            // options={[]} // 可以提供一些预设标签选项
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
    </div> // 闭合外部 div
  );
};

export default ScriptEditorPage;