import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Form, Input, Button, message, Card, Typography, Space } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { AICharacter } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { useLastVisited } from '../contexts/LastVisitedContext';

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
  const rolesFileName = 'characters.json';

  const [currentFormValues, setCurrentFormValues] = useState<Partial<AICharacter>>(restoredState?.formValues ?? {});
  const isInitialLoad = useRef(true);

  // --- 数据加载或状态恢复 Effect ---
  useEffect(() => {
    // 检查 location.key 是否为 'default'，如果是，则忽略 restoredState
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
          const result = await window.electronAPI.readStore(rolesFileName, [] as AICharacter[]);
          if (result.success && Array.isArray(result.data)) {
            const characterToEdit = result.data.find(character => character.id === characterId);
            if (characterToEdit) {
              form.setFieldsValue(characterToEdit);
              setCurrentFormValues(characterToEdit);
            } else {
              message.error('未找到要编辑的角色！');
              navigate('/characters');
            }
          } else {
            message.error(`加载角色数据失败: ${result.error || '未知错误'}`);
            navigate('/characters');
          }
        } catch (error) {
          message.error(`调用读取存储时出错: ${error instanceof Error ? error.message : String(error)}`);
          navigate('/characters');
        } finally {
          setLoading(false);
        }
      };
      loadCharacter();
      isInitialLoad.current = false;
    } else if (!isEditMode && isInitialLoad.current) {
        console.log('[CharacterEditorPage] Initializing for add mode...');
        const defaultValues = { gender: '未知' };
        form.setFieldsValue(defaultValues);
        setCurrentFormValues(defaultValues);
        isInitialLoad.current = false;
    } else if (isInitialLoad.current) {
        isInitialLoad.current = false;
    }
  }, [isEditMode, characterId, navigate, form, restoredState, location.key]);

  // --- 监听表单值变化并更新 currentFormValues ---
  // 修复 ESLint any 警告
  const handleFormValuesChange = (_changedValues: unknown, allValues: Partial<AICharacter>) => {
      if (!isInitialLoad.current) {
          setCurrentFormValues(allValues);
      }
  };


  // --- 保存状态到 Context Effect ---
  useEffect(() => {
    if (!isInitialLoad.current && !loading && Object.keys(currentFormValues).length > 0) {
        const currentStateSnapshot: CharacterEditorStateSnapshot = {
            formValues: currentFormValues,
            isEditMode: isEditMode,
            characterId: characterId,
        };
        updateLastVisitedNavInfo('characters', location.pathname, undefined, currentStateSnapshot);
    }
  }, [currentFormValues, isEditMode, characterId, updateLastVisitedNavInfo, location.pathname, loading]);


  // --- 处理表单提交 (保存) ---
  // 修复 onFinish 类型错误
  const handleFinish = async (values: Partial<AICharacter>) => {
    // 在函数内部进行更严格的校验，确保必填项存在
    if (!values.name || !values.personality) {
        message.error('请确保姓名和性格已填写！');
        return;
    }
    // 此时可以安全地认为 values 满足 Omit<AICharacter, 'id'> 的大部分要求
    // 如果还有其他必填项，也应在此处检查

    setLoading(true);
    try {
      const allCharactersResult = await window.electronAPI.readStore(rolesFileName, [] as AICharacter[]);
      if (!allCharactersResult.success || !Array.isArray(allCharactersResult.data)) {
         message.error(`加载现有角色列表失败: ${allCharactersResult.error || '未知错误'}`);
         setLoading(false);
         return;
      }

      let updatedCharacters: AICharacter[];
      const currentCharacters = allCharactersResult.data;

      // 类型断言，因为我们已经在上面检查过必填项
      const finalValues = values as Omit<AICharacter, 'id'>;

      if (isEditMode && characterId) {
        updatedCharacters = currentCharacters.map(character =>
          character.id === characterId ? { ...character, ...finalValues, id: characterId } : character
        );
      } else {
        const newCharacter: AICharacter = {
          id: uuidv4(),
          ...finalValues, // 使用校验后的 finalValues
        };
        updatedCharacters = [...currentCharacters, newCharacter];
      }

      const saveResult = await window.electronAPI.writeStore(rolesFileName, updatedCharacters);
      if (saveResult.success) {
        message.success(isEditMode ? '角色已更新' : '角色已添加');
        // 清除当前版块的最后访问状态，以便下次从列表页进入
        updateLastVisitedNavInfo('characters', '/characters', undefined, undefined);
        navigate('/characters');
      } else {
        message.error(`保存角色失败: ${saveResult.error || '未知错误'}`);
      }
    } catch (error) {
      message.error(`保存角色时出错: ${error instanceof Error ? error.message : String(error)}`);
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
       loading={loading && isEditMode && isInitialLoad.current}
      >
          <Form
            form={form}
            layout="vertical"
            onFinish={handleFinish} // 现在类型匹配了
            onValuesChange={handleFormValuesChange}
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