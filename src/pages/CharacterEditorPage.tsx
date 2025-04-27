import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
// 移除 PageHeader, 添加 Typography 和 Space
import { Form, Input, Button, message, Card, Typography, Space } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons'; // 导入返回图标
import { AICharacter } from '../types';
import { v4 as uuidv4 } from 'uuid';

const CharacterEditorPage: React.FC = () => {
  const { id: characterId } = useParams<{ id: string }>(); // 获取 URL 中的角色 ID (编辑时)
  const navigate = useNavigate(); // 获取导航函数
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [initialValues, setInitialValues] = useState<Partial<AICharacter>>({}); // 用于编辑时填充表单

  const isEditMode = !!characterId; // 判断是编辑模式还是添加模式
  const rolesFileName = 'characters.json'; // 使用统一的文件名

  // 如果是编辑模式，加载现有角色数据
  useEffect(() => {
    if (isEditMode && characterId) {
      setLoading(true);
      const loadCharacter = async () => {
        try {
          const result = await window.electronAPI.readStore(rolesFileName, [] as AICharacter[]);
          if (result.success && Array.isArray(result.data)) {
            const characterToEdit = result.data.find(character => character.id === characterId);
            if (characterToEdit) {
              setInitialValues(characterToEdit);
              form.setFieldsValue(characterToEdit); // 填充表单
            } else {
              message.error('未找到要编辑的角色！');
              navigate('/characters'); // 跳转回列表页
            }
          } else {
            message.error(`加载角色数据失败: ${result.error || '未知错误'}`);
            navigate('/characters');
          }
        } catch (error) {
          message.error(`调用读取存储时出错: ${error}`);
          navigate('/characters');
        } finally {
          setLoading(false);
        }
      };
      loadCharacter();
    } else {
       // 添加模式，可以设置一些默认值
       form.setFieldsValue({ gender: '未知' });
    }
  }, [isEditMode, characterId, navigate, form]);

  // 处理表单提交 (保存)
  const handleFinish = async (values: Omit<AICharacter, 'id'>) => {
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

      if (isEditMode && characterId) {
        // 编辑模式
        updatedCharacters = currentCharacters.map(character =>
          character.id === characterId ? { ...initialValues, ...values, id: characterId } : character // 合并旧数据和新数据
        );
      } else {
        // 添加模式
        const newCharacter: AICharacter = {
          id: uuidv4(),
          ...values,
        };
        updatedCharacters = [...currentCharacters, newCharacter];
      }

      const saveResult = await window.electronAPI.writeStore(rolesFileName, updatedCharacters);
      if (saveResult.success) {
        message.success(isEditMode ? '角色已更新' : '角色已添加');
        navigate('/characters'); // 保存成功后返回列表页
      } else {
        message.error(`保存角色失败: ${saveResult.error || '未知错误'}`);
      }
    } catch (error) {
      message.error(`保存角色时出错: ${error}`);
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
       loading={loading && isEditMode} // 编辑时加载数据才显示 loading
      >
          <Form
            form={form}
            layout="vertical"
            onFinish={handleFinish}
            initialValues={initialValues} // 设置表单初始值 (编辑时)
          >
            {/* 表单项和之前 Modal 里的一样 */}
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
      </Card> // Card 结束
    );
  };

export default CharacterEditorPage;