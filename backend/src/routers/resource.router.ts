import { Router } from 'express';
import type ResourceController from '../controllers/resource.controller';

export default function resourceRouter(controller: ResourceController): Router {
    const router = Router();
    router.get('/', controller.list.bind(controller));
    router.get('/:id', controller.get.bind(controller));
    router.post('/', controller.create.bind(controller));
    router.put('/:id', controller.update.bind(controller));
    router.patch('/:id', controller.update.bind(controller));
    router.delete('/:id', controller.delete.bind(controller));
    return router;
}
