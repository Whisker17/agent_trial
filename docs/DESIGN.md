# Mantle Agent-as-a-Service Platform Deisgn Spec

## Overviews

- 给用户提供一个一键部署 agent 的平台，即一个 agent as a service 的服务，这个平台是给非开发者用户使用的 agent template 和简易部署，会提供一些基础的功能扩展，用户可以勾选一些功能作为 agent 的初始化功能，例如社交软件控制，合约部署等，同时用户还可以通过 skills 来完成对 agent 的功能扩展

- 本意是想做一个 AaaS 平台，同时需要有能让用户通过 LLM model 来实现对自己控制的 agent 这个实例的能力和功能扩展，所以我设置了 skills 的分级管理和隔离机制，在我的想法中，AaaS 会提供一些最基础的 skills 帮助 agent 实例的创建，在完成 agents 初始化之后，用户可以根据自己的需求来提出一些想法的 prototype，然后agent 会去调用 AaaS 中的系统级别的 skills（skills-creator）来编写一个比较符合规定的 skill，而这个 skill 则是用户 agent 实例用于扩展能力和功能的基石，用户的这个 agent 会根据这个 skills 来实现背后的逻辑，但是我希望你能够明白所有的用户的需求是各不相同的，所以skills应该是在 AaaS 平台代码中会出现的，可能是一个通过注册的方式写进数据库的方式，而特定功能的后端代码应该是互不影响的，只存在于用户的 agent 实例中。

- 另外 skills 是可以共享的，你可以在每一个 agent 的主页中看到其实现的功能所使用的 skills，这是不影响的，因为用户即使有相关功能的 skills 也不一定能够构建出正确的后端代码，所以 api marketplace 依然是有需求的

- 而 agents 不同功能的 API 则通过一个 marketplace 进行统一管理和发现，agents 到最后只需要根据用户的自然语言来去 marketplace 中找到可用的 API 来进行调用并获取结果，而不是重复开发

## Key Features

### 功能自扩展和自升级
- 我希望可以引入一个 skills creator 的 skills 来帮助写 skills，目前 creator skills 已经被加载到 `./../skills/_system/skills-creator` 中
- 主要的功能是这个 AaaS 平台在新建 agent 的时候可以选择初始化带有哪些功能（基于 base skills 中预实现的），然后我希望这些功能是属于可扩展可升级的，因此用户可以通过自然语言描述自己的功能需求，然后通过 skills creator 这个 skill 来完成标准化的 skill 的编写，然后 agent 通过这个 skill 来完成后端功能的开发

### Agent API Marketplace
- 提供一个 agent api marketplace，让 agent 去完成一些功能发现，减少重复开发的成本

### 资产发行
- 需要给所有 agents 能够自行发行资产的能力，这些资产用于支付给 agent 换取其提供的功能/服务/api
- 需要完成和 dex 的联动，完成公平发射，即 agents 在发行完资产后自动部署在 dex 上

## Skills 分级隔离设置

目前的设计是将 skills 分为三个层级
- System
  - 这里面是一个平台级别的 skills 保存，即所有 agents 都受到这类 skills 的影响
  - 目前包含
    - Skills creator
      - 用户可以使用这个skill来完成自定义功能的 skill 编写
    - Mantle network basics
      - 介绍了 Mantle 网络的主要信息和基础知识，让 agents 可以更好了解 Mantle 网络情况
- Base
  - 这里面包含的是一些 agents 可以在初始化阶段自定义选配的 skills
  - 目前包含
    - Assets Deploy
      - 支持 agents 自部署资产，目前支持 ERC20，ERC721
    - 社交软件控制
      - 支持通过一些常用的社交软件来控制该 agent，支持 TG，Discord
- Advanced
  - 用户自己定义的一些功能
  - 目前包含
    - 8004 的注册与代注册功能
    - 寻找 Mantle 链上目前最佳的资产 Yield Boost 方案
    - 支持简易 dapps 开发与部署，设计并开发类似于 fomo3d 的游戏给 agents 玩
