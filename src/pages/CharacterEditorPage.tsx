import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Form, Input, Button, message, Card, Typography, Space } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { AICharacter } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { useLastVisited } from '../hooks/useLastVisited'; // <-- 修改导入路径

// 定义页面内部状态快照的类型
type CharacterEditorStateSnapshot = {
    formValues: Partial<AICharacter>;
    isEditMode: boolean;
    characterId?: string;
};

const CharacterEditorPage: React.FC = () => {
  const { id: characterIdFromParams } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { updateLastVisitedNavInfo } = useLastVisited();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const restoredState = location.state as CharacterEditorStateSnapshot | undefined;
  const isEditMode = restoredState?.isEditMode ?? !!characterIdFromParams;
  const characterId = restoredState?.characterId ?? characterIdFromParams;
  // const rolesFileName = 'characters.json'; // 不再需要

  const [currentFormValues, setCurrentFormValues] = useState<Partial<AICharacter>>(restoredState?.formValues ?? {});
  const isInitialLoad = useRef(true);

  // --- 数据加载或状态恢复 Effect ---
  useEffect(() => {
    const isActualNavigation = location.key !== 'default';

    if (restoredState && restoredState.formValues && isActualNavigation) {
      console.log('[CharacterEditorPage] Restoring state from context:', restoredState);
      form.setFieldsValue(restoredState.formValues);
      setCurrentFormValues(restoredState.formValues);
      isInitialLoad.current = false;
    } else if (isEditMode && characterId && isInitialLoad.current) {
      console.log('[CharacterEditorPage] Loading character data for editing...');
      setLoading(true);
      const loadCharacter = async () => {
        try {
          // 使用 listCharacters 获取所有角色，然后在前端查找
          const result = await window.electronAPI.listCharacters();
          if (result.success && Array.isArray(result.data)) {
            const characterToEdit = result.data.find(character => character.id === characterId);
            if (characterToEdit) {
              console.log('[CharacterEditorPage] Found character to edit:', characterToEdit);
              form.setFieldsValue(characterToEdit);
              setCurrentFormValues(characterToEdit);
            } else {
              message.error(`ID 为 ${characterId} 的角色未找到！`);
              navigate('/characters');
            }
          } else {
            message.error(`加载角色列表失败: ${result.error || '未知错误'}`);
            navigate('/characters');
          }
        } catch (error: unknown) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          message.error(`调用 listCharacters 时出错: ${errorMsg}`);
          navigate('/characters');
        } finally {
          setLoading(false);
        }
      };
      loadCharacter();
      isInitialLoad.current = false;
    } else if (!isEditMode && isInitialLoad.current) {
        console.log('[CharacterEditorPage] Initializing for add mode...');
        const defaultValues = { gender: '未知' }; // 可以设置更多默认值
        form.setFieldsValue(defaultValues);
        setCurrentFormValues(defaultValues);
        isInitialLoad.current = false;
    } else if (isInitialLoad.current) {
        // 既不是恢复状态，也不是编辑模式加载，也不是添加模式初始化，则标记加载完成
        isInitialLoad.current = false;
    }
  }, [isEditMode, characterId, navigate, form, restoredState, location.key]);

  // --- 监听表单值变化并更新 currentFormValues ---
  const handleFormValuesChange = (_changedValues: unknown, allValues: Partial<AICharacter>) => {
      if (!isInitialLoad.current) {
          // 确保 ID 不会被表单覆盖（如果表单里没有 ID 字段）
          const valuesToStore = { ...allValues };
          if (isEditMode && characterId && !valuesToStore.id) {
              valuesToStore.id = characterId;
          }
          setCurrentFormValues(valuesToStore);
      }
  };


  // --- 保存状态到 Context Effect ---
  useEffect(() => {
    // 只有在非初始加载、非loading状态、且表单有值时才保存快照
    if (!isInitialLoad.current && !loading && Object.keys(currentFormValues).length > 0) {
        const currentStateSnapshot: CharacterEditorStateSnapshot = {
            formValues: currentFormValues,
            isEditMode: isEditMode,
            characterId: characterId, // 保存当前页面的 characterId
        };
        console.log('[CharacterEditorPage] Saving snapshot to context:', currentStateSnapshot);
        updateLastVisitedNavInfo('characters', location.pathname, undefined, currentStateSnapshot);
    }
  }, [currentFormValues, isEditMode, characterId, updateLastVisitedNavInfo, location.pathname, loading]);


  // --- 处理表单提交 (保存) ---
  const handleFinish = async (values: Partial<AICharacter>) => {
    if (!values.name || !values.personality) {
        message.error('请确保姓名和性格已填写！');
        return;
    }

    setLoading(true);
    try {
      // 准备要保存的角色数据
      const characterToSave: AICharacter = {
        ...values, // 包含表单所有字段
        id: isEditMode && characterId ? characterId : uuidv4(), // 编辑模式用现有 ID，添加模式生成新 ID
        name: values.name, // 确保必填项存在 (TS 需要)
        personality: values.personality, // 确保必填项存在 (TS 需要)
        // 确保其他可选字段如果为 undefined 或空字符串，也正确传递
        identity: values.identity || undefined,
        gender: values.gender || undefined,
        age: values.age || undefined,
        background: values.background || undefined,
        appearance: values.appearance || undefined,
        abilities: values.abilities || undefined,
        goals: values.goals || undefined,
        secrets: values.secrets || undefined,
        relationships: values.relationships || undefined,
        mannerisms: values.mannerisms || undefined,
        voiceTone: values.voiceTone || undefined,
        catchphrase: values.catchphrase || undefined,
        notes: values.notes || undefined,
        avatar: values.avatar || undefined,
      };

      console.log('[CharacterEditorPage] Attempting to save character:', characterToSave);

      // 调用新的 saveCharacter API
      const saveResult = await window.electronAPI.saveCharacter(characterToSave);

      if (saveResult.success) {
        message.success(isEditMode ? '角色已更新' : '角色已添加');
        // 清除当前版块的最后访问状态，以便下次从列表页进入
        updateLastVisitedNavInfo('characters', '/characters', undefined, undefined);
        navigate('/characters'); // 保存成功后返回列表页
      } else {
        message.error(`保存角色失败: ${saveResult.error || '未知错误'}`);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error(`调用 saveCharacter 时出错: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title={
      <Space>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/characters')} />
        <Typography.Title level={4} style={{ marginBottom: 0 }}>
          {isEditMode ? "编辑角色" : "添加新角色"}
        </Typography.Title>
        </Space>
       }
       extra={<Typography.Text type="secondary">填写角色的详细信息</Typography.Text>}
       // 初始加载时显示 Loading
       loading={loading && isInitialLoad.current}
      >
          <Form
            form={form}
            layout="vertical"
            onFinish={handleFinish}
            onValuesChange={handleFormValuesChange}
            // 在加载完成或状态恢复后设置初始值，避免覆盖
            initialValues={currentFormValues}
          >
            {/* 表单项保持不变 */}
            <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入角色姓名!' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="identity" label="身份 (可选)">
              <Input placeholder="例如：皇帝、密探、游侠..." />
            </Form.Item>
            <Form.Item name="gender" label="性别 (可选)">
              <Input placeholder="例如：男、女、未知..." />
            </Form.Item>
            <Form.Item name="age" label="年龄 (可选)">
              <Input placeholder="例如：25、青年、老年..." />
            </Form.Item>
            <Form.Item name="personality" label="性格" rules={[{ required: true, message: '请输入性格描述!' }]}>
              <Input.TextArea rows={3} placeholder="角色的核心性格特点..." />
            </Form.Item>
            <Form.Item name="background" label="背景故事 (可选)">
              <Input.TextArea rows={3} placeholder="角色的过往经历、出身等..." />
            </Form.Item>
            <Form.Item name="appearance" label="外貌描述 (可选)">
              <Input.TextArea rows={2} placeholder="角色的外貌特征..." />
            </Form.Item>
            <Form.Item name="abilities" label="能力/特长 (可选)">
              <Input.TextArea rows={2} placeholder="角色擅长什么..." />
            </Form.Item>
            <Form.Item name="goals" label="目标/动机 (可选)">
              <Input.TextArea rows={2} placeholder="角色想要达成什么..." />
            </Form.Item>
            <Form.Item name="secrets" label="秘密 (可选)">
              <Input.TextArea rows={2} placeholder="角色隐藏的事情..." />
            </Form.Item>
            <Form.Item name="relationships" label="人物关系 (可选)">
              <Input.TextArea rows={2} placeholder="与其他角色的关系描述..." />
            </Form.Item>
            <Form.Item name="mannerisms" label="言行举止/小动作 (可选)">
              <Input.TextArea rows={2} placeholder="角色的习惯性动作、说话方式等..." />
            </Form.Item>
            <Form.Item name="voiceTone" label="说话音调/风格 (可选)">
              <Input placeholder="例如：低沉、沙哑、尖锐、温柔..." />
            </Form.Item>
            <Form.Item name="catchphrase" label="口头禅 (可选)">
              <Input placeholder="角色经常说的话..." />
            </Form.Item>
            <Form.Item name="notes" label="其他备注 (可选)">
              <Input.TextArea rows={3} placeholder="任何其他需要记录的信息..." />
            </Form.Item>
            <Form.Item name="avatar" label="头像 (URL 或标识符, 可选)">
              <Input placeholder="例如：/avatars/emperor.png 或 https://..." />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading}>
                {isEditMode ? '更新角色' : '添加角色'}
              </Button>
              <Button style={{ marginLeft: 8 }} onClick={() => navigate('/characters')}>
                取消
              </Button>
            </Form.Item>
          </Form>
      </Card>
    );
  };

export default CharacterEditorPage;