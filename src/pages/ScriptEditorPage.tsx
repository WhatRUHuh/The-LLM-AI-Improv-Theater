import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Form, Input, Button, message, Card, Typography, Space, Select } from 'antd'; // 导入需要的组件
import { ArrowLeftOutlined } from '@ant-design/icons';
import { Script, AICharacter } from '../types'; // 导入剧本和角色类型
import { v4 as uuidv4 } from 'uuid';

const ScriptEditorPage: React.FC = () => {
  const { id: scriptId } = useParams<{ id: string }>(); // 获取 URL 中的剧本 ID (编辑时)
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [initialValues, setInitialValues] = useState<Partial<Script>>({});
  const [allCharacters, setAllCharacters] = useState<AICharacter[]>([]); // 存储所有角色用于选择

  const isEditMode = !!scriptId;
  const scriptsFileName = 'scripts.json';
  const rolesFileName = 'characters.json';

  // 加载所有角色数据 (用于下拉选择)
  const loadAllCharacters = async () => {
    // setLoading(true); // 选择性地为角色加载添加 loading
    try {
      const result = await window.electronAPI.readStore(rolesFileName, [] as AICharacter[]);
      if (result.success && Array.isArray(result.data)) {
        setAllCharacters(result.data);
      } else {
        message.error(`加载角色列表失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      message.error(`调用读取角色存储时出错: ${error}`);
    }
    // finally { setLoading(false); }
  };


  // 如果是编辑模式，加载现有剧本数据
  useEffect(() => {
    loadAllCharacters(); // 总是需要加载角色列表

    if (isEditMode && scriptId) {
      setLoading(true);
      const loadScript = async () => {
        try {
          const result = await window.electronAPI.readStore(scriptsFileName, [] as Script[]);
          if (result.success && Array.isArray(result.data)) {
            const scriptToEdit = result.data.find(script => script.id === scriptId);
            if (scriptToEdit) {
              setInitialValues(scriptToEdit);
              form.setFieldsValue(scriptToEdit); // 填充表单
            } else {
              message.error('未找到要编辑的剧本！');
              navigate('/scripts'); // 跳转回列表页
            }
          } else {
            message.error(`加载剧本数据失败: ${result.error || '未知错误'}`);
            navigate('/scripts');
          }
        } catch (error) {
          message.error(`调用读取存储时出错: ${error}`);
          navigate('/scripts');
        } finally {
          setLoading(false);
        }
      };
      loadScript();
    } else {
       // 添加模式，确保 characterIds 字段存在且为空数组或 undefined
       form.setFieldsValue({ characterIds: [] });
    }
  }, [isEditMode, scriptId, navigate, form]);

  // 处理表单提交 (保存)
  const handleFinish = async (values: Omit<Script, 'id'>) => {
    setLoading(true);
    try {
      const allScriptsResult = await window.electronAPI.readStore(scriptsFileName, [] as Script[]);
      if (!allScriptsResult.success || !Array.isArray(allScriptsResult.data)) {
         message.error(`加载现有剧本列表失败: ${allScriptsResult.error || '未知错误'}`);
         setLoading(false);
         return;
      }

      let updatedScripts: Script[];
      const currentScripts = allScriptsResult.data;
      const selectedCharacterIds = values.characterIds || []; // 确保有默认值

      if (isEditMode && scriptId) {
        // 编辑模式: 合并旧数据、表单值，并确保 ID 不变
        updatedScripts = currentScripts.map(script =>
          script.id === scriptId ? {
             ...initialValues, // 保留旧数据（如 id）
             ...values,        // 应用表单所有新值 (包括新增字段)
             characterIds: selectedCharacterIds, // 覆盖 characterIds
             id: scriptId      // 确保 ID 不变
            } : script
        );
      } else {
        // 添加模式: 使用表单所有值创建新对象
        const newScript: Script = {
          id: uuidv4(),
          ...values, // 应用表单所有新值 (包括新增字段)
          characterIds: selectedCharacterIds, // 覆盖 characterIds
        };
        updatedScripts = [...currentScripts, newScript];
      }

      const saveResult = await window.electronAPI.writeStore(scriptsFileName, updatedScripts);
      if (saveResult.success) {
        message.success(isEditMode ? '剧本已更新' : '剧本已添加');
        navigate('/scripts'); // 保存成功后返回列表页
      } else {
        message.error(`保存剧本失败: ${saveResult.error || '未知错误'}`);
      }
    } catch (error) {
      message.error(`保存剧本时出错: ${error}`);
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
     loading={loading && isEditMode}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={initialValues}
      >
        <Form.Item name="title" label="剧本标题" rules={[{ required: true, message: '请输入剧本标题!' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="scene" label="场景描述 (可选)">
          <Input.TextArea rows={3} placeholder="描述故事发生的场景..." />
        </Form.Item>
        {/* --- 新增字段的表单项 --- */}
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
          {/* 使用 Select 的 tags 模式方便输入多个标签 */}
          <Select
            mode="tags"
            style={{ width: '100%' }}
            placeholder="输入标签后按回车确认，例如：宫斗, 权谋, 反转"
            tokenSeparators={[',']} // 允许用逗号分隔
          />
        </Form.Item>
        {/* --- 选择角色部分不变 --- */}
        <Form.Item name="characterIds" label="选择角色 (可选)">
          <Select
            mode="multiple"
            allowClear
            style={{ width: '100%' }}
            placeholder="请选择参演角色"
            loading={!allCharacters.length && loading} // 角色列表加载中也显示 loading
            options={allCharacters.map(character => ({
              label: character.name,
              value: character.id,
            }))}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        </Form.Item>
        {/* --- 提交按钮部分不变 --- */}
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