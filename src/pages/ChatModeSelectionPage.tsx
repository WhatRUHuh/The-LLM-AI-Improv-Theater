import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, Typography, message } from 'antd'; // <-- 导入 message
import { UserOutlined, TeamOutlined, PlaySquareOutlined } from '@ant-design/icons';

// 定义聊天模式类型
export type ChatMode = 'singleUserSingleAI' | 'singleUserMultiAI' | 'director';

const ChatModeSelectionPage: React.FC = () => {
  const navigate = useNavigate();

  const handleModeSelect = (mode: ChatMode) => {
    console.log(`[ChatModeSelection] Selected mode: ${mode}`);
    // 导航到下一步（聊天设置页面），并传递选择的模式
    // 注意：路由路径需要与 router.tsx 中定义的一致
    if (mode === 'singleUserSingleAI') {
      navigate('/single-user-single-ai-setup', { state: { mode } }); // <-- 修改导航路径
    } else {
      // TODO: 为其他模式添加导航逻辑
      message.warning(`模式 "${mode}" 的设置页面尚未实现！`);
    }
  };

  return (
    <div>
      <Typography.Title level={2} style={{ marginBottom: 24 }}>选择聊天模式</Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={8}>
          <Card hoverable onClick={() => handleModeSelect('singleUserSingleAI')}>
            <Card.Meta
              avatar={<UserOutlined style={{ fontSize: '24px' }} />}
              title="单人单 AI"
              description="您扮演一个角色，与一个 AI 扮演的角色进行对话。"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card hoverable onClick={() => handleModeSelect('singleUserMultiAI')}>
            <Card.Meta
              avatar={<TeamOutlined style={{ fontSize: '24px' }} />}
              title="单人多 AI"
              description="您扮演一个角色，与多个 AI 扮演的角色进行对话。"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card hoverable onClick={() => handleModeSelect('director')}>
            <Card.Meta
              avatar={<PlaySquareOutlined style={{ fontSize: '24px' }} />}
              title="导演模式"
              description="您作为导演观察，让多个 AI 角色根据剧本自动进行对话。"
            />
          </Card>
        </Col>
      </Row>
      {/* 可以添加返回按钮或其他导航元素 */}
      {/* <Button onClick={() => navigate('/')} style={{ marginTop: 24 }}>返回</Button> */}
    </div>
  );
};

export default ChatModeSelectionPage;