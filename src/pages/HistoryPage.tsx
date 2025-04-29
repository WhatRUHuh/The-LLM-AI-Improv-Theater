import React, { useState, useEffect } from 'react';
// 导入 theme 用于获取背景色等 token
import { List, Spin, message, Typography, Empty, Tag, Button, Popconfirm, theme } from 'antd';
import { EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
// 假设 ChatPageStateSnapshot 类型已经移到 types/index.ts 并导出
// 如果没有，需要先去 SingleUserSingleAIInterfacePage.tsx 导出，或者移到 types/index.ts
import type { ChatPageStateSnapshot } from '../types';
import type { ChatMode } from '../types'; // <-- 修改导入路径

const { Text, Title } = Typography;

// 定义历史记录项的结构，方便管理
interface HistoryItem {
  fileName: string;
  mode: ChatMode | string; // 模式可能是已知的 ChatMode 或未知字符串
  scriptTitle: string;
  timestamp: number; // 从文件名解析的时间戳
  snapshot?: ChatPageStateSnapshot; // 可选地存储完整快照，用于“查看”
}

// 辅助函数：尝试从文件名解析时间戳
const parseTimestampFromFilename = (fileName: string): number => {
  // 假设文件名格式为 "*-时间戳.json"
  const match = fileName.match(/-(\d+)\.json$/);
  return match ? parseInt(match[1], 10) : 0;
};

// 辅助函数：格式化模式显示名称
const formatModeName = (mode: ChatMode | string): string => {
    switch (mode) {
        case 'singleUserSingleAI': return '单人单 AI';
        // 在这里添加其他模式的显示名称
        default: return mode; // 未知模式直接显示原始值
    }
}

const HistoryPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const navigate = useNavigate();
  // 获取 antd 主题 token
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  // 加载历史记录列表
  const loadHistory = async () => {
    setLoading(true);
    try {
      const listResult = await window.electronAPI.listChatSessions();
      if (listResult.success && listResult.data) {
        const fileNames = listResult.data;
        if (fileNames.length === 0) {
          setHistoryList([]);
          setLoading(false); // 别忘了在这里设置 loading false
          return;
        }

        // 并行读取所有文件内容 (现在需要读取 chats 目录下的文件)
        const readPromises = fileNames.map(async (fileName) => {
          // 构建相对路径 'chats/fileName'
          const relativePath = `chats/${fileName}`;
          console.log(`[HistoryPage] Reading file: ${relativePath}`);
          const readResult = await window.electronAPI.readStore(relativePath, null); // <-- 使用相对路径读取
          if (readResult.success && readResult.data) {
            try {
              // 假设文件内容是 ChatPageStateSnapshot
              const snapshot = readResult.data as ChatPageStateSnapshot;
              // 基本校验，确保快照结构符合预期
              if (snapshot && snapshot.chatConfig && snapshot.chatConfig.mode && snapshot.chatConfig.script) {
                 return {
                   fileName,
                   mode: snapshot.chatConfig.mode,
                   scriptTitle: snapshot.chatConfig.script.title || '无标题剧本',
                   timestamp: parseTimestampFromFilename(fileName),
                   snapshot: snapshot, // 保存完整快照以便后续使用
                 };
              } else {
                 console.warn(`文件 ${fileName} 内容格式不符合 ChatPageStateSnapshot 结构，已跳过。`);
                 return null; // 格式不符则跳过
              }
            } catch (parseError) {
              console.error(`解析文件 ${fileName} 失败:`, parseError);
              return null; // 解析失败也跳过
            }
          } else {
            console.error(`读取文件 ${fileName} 失败: ${readResult.error}`);
            return null; // 读取失败也跳过
          }
        });

        const results = await Promise.all(readPromises);
        const validHistoryItems = results.filter(item => item !== null) as HistoryItem[];

        // 按时间戳降序排序（最新的在前面）
        validHistoryItems.sort((a, b) => b.timestamp - a.timestamp);

        setHistoryList(validHistoryItems);

      } else {
        message.error(`加载历史记录列表失败: ${listResult.error || '未知错误'}`);
        setHistoryList([]); // 出错时清空列表
      }
    } catch (error) {
      message.error(`加载历史记录时发生意外错误: ${error instanceof Error ? error.message : String(error)}`);
      setHistoryList([]); // 出错时清空列表
    } finally {
      setLoading(false);
    }
  };

  // 组件加载时执行一次加载
  useEffect(() => {
    loadHistory();
  }, []);

  // 处理删除操作
  const handleDelete = async (fileName: string) => {
    // 删除时也需要确保操作的是 chats 目录下的文件
    console.log(`[HistoryPage] Deleting file: ${fileName}`);
    try {
      // deleteChatSession 内部已经处理了 chats 目录，直接传文件名即可
      const deleteResult = await window.electronAPI.deleteChatSession(fileName);
      if (deleteResult.success) {
        message.success(`历史记录 ${fileName} 已删除`);
        // 刷新列表
        loadHistory(); // 重新加载以确保数据一致性
        // 或者直接从 state 中移除:
        // setHistoryList(prevList => prevList.filter(item => item.fileName !== fileName));
      } else {
        message.error(`删除失败: ${deleteResult.error || '未知错误'}`);
      }
    } catch (error) {
       message.error(`删除时发生意外错误: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // 处理查看操作
  const handleView = (item: HistoryItem) => {
    console.log('查看:', item);
    if (!item.snapshot) {
        message.error('无法加载此历史记录的详细信息。');
        return;
    }
    // 根据模式跳转到对应的聊天界面
    // 现在只有一种模式，直接跳转
    if (item.mode === 'singleUserSingleAI') {
        navigate('/single-user-single-ai-interface', { state: item.snapshot });
    } else {
        message.warning(`暂不支持查看 "${formatModeName(item.mode)}" 模式的历史记录。`);
    }
  };


  return (
    // 1. 添加外部 div，负责滚动和左侧 5px 灰色边距
    <div style={{ maxHeight: 'calc(100vh - 5px)', overflow: 'auto', paddingLeft: '5px' }}>
      {/* 2. 给内部容器加上背景、圆角和内边距 */}
      <div style={{ background: colorBgContainer, borderRadius: borderRadiusLG, padding: 10 }}>
        <Title level={2}>历史记录</Title>
        <Spin spinning={loading}>
        {historyList.length === 0 && !loading ? (
          <Empty description="暂无历史记录" />
        ) : (
          <List
            itemLayout="horizontal"
            dataSource={historyList}
            renderItem={item => (
              <List.Item
                actions={[
                  <Button icon={<EyeOutlined />} onClick={() => handleView(item)} key="list-view">
                    查看
                  </Button>,
                  <Popconfirm
                    title="确定删除这条记录吗？"
                    onConfirm={() => handleDelete(item.fileName)}
                    okText="确定"
                    cancelText="取消"
                    key="list-delete"
                  >
                    <Button danger icon={<DeleteOutlined />}>
                      删除
                    </Button>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={<Text strong>{item.scriptTitle}</Text>}
                  description={
                    <>
                      <Tag color="blue">{formatModeName(item.mode)}</Tag>
                      <Text type="secondary" style={{ marginLeft: 8 }}>
                        {item.fileName} ({new Date(item.timestamp).toLocaleString()})
                      </Text>
                    </>
                  }
                />
              </List.Item>
            )}
          />
        )}
        </Spin>
      </div>
    </div>
  );
};

export default HistoryPage;