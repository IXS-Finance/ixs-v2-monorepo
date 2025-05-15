// models/RwaRegistryDeployer.ts

import { deploy } from '../../contract';
import { RwaRegistryDeployment } from './types';
import RwaRegistry from './RwaRegistry';

export default {
  /**
   * Deploys the RwaRegistry contract.
   * @param deployment - Deployment parameters.
   */
  async deploy(deployment: RwaRegistryDeployment): Promise<RwaRegistry> {
    const { from, authorizer } = deployment;

    // Deploy the RwaRegistry contract
    const instance = await deploy('v2-vault/RwaRegistry', { from, args: [authorizer] });

    // Create and return the RwaRegistry instance
    return new RwaRegistry(instance);
  },
};
